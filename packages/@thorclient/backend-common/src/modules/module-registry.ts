import { ModuleMetadata } from '@n8n/decorators';
import type { EntityClass, ModuleSettings } from '@n8n/decorators';
import { Container, Service } from '@n8n/di';
import { existsSync } from 'fs';
import path from 'path';

import { MissingModuleError } from './errors/missing-module.error';
import { ModuleConfusionError } from './errors/module-confusion.error';
import { ModulesConfig } from './modules.config';
import type { ModuleName } from './modules.config';
import { LicenseState } from '../license-state';
import { Logger } from '../logging/logger';

@Service()
export class ModuleRegistry {
	readonly entities: EntityClass[] = [];

	readonly loadDirs: string[] = [];

	readonly settings: Map<string, ModuleSettings> = new Map();

	constructor(
		private readonly moduleMetadata: ModuleMetadata,
		private readonly licenseState: LicenseState,
		private readonly logger: Logger,
		private readonly modulesConfig: ModulesConfig,
	) {}

	private readonly defaultModules: ModuleName[] = ['insights', 'external-secrets'];

	private readonly activeModules: string[] = [];

	get eligibleModules(): ModuleName[] {
		const { enabledModules, disabledModules } = this.modulesConfig;

		const doubleListed = enabledModules.filter((m) => disabledModules.includes(m));

		if (doubleListed.length > 0) throw new ModuleConfusionError(doubleListed);

		const defaultPlusEnabled = [...new Set([...this.defaultModules, ...enabledModules])];

		return defaultPlusEnabled.filter((m) => !disabledModules.includes(m));
	}

	/**
	 * Loads [module name].module.ts for each eligible module.
	 * This only registers the database entities for module and should be done
	 * before instantiating the datasource.
	 *
	 * This will not register routes or do any other kind of module related
	 * setup.
	 */
	async loadModules(modules?: ModuleName[]) {
		this.logger.debug('Starting module loading process', {
			modulesToLoad: modules ?? this.eligibleModules,
			totalEligibleModules: this.eligibleModules.length,
		});

		let modulesDir: string;

		try {
			// docker + tests
			const n8nPackagePath = require.resolve('n8n-atom/package.json');
			const n8nRoot = path.dirname(n8nPackagePath);
			const srcDirExists = existsSync(path.join(n8nRoot, 'src'));
			const dir = process.env.NODE_ENV === 'test' && srcDirExists ? 'src' : 'dist';
			modulesDir = path.join(n8nRoot, dir, 'modules');
			this.logger.debug('Using Docker/test modules directory', {
				modulesDir,
				environment: process.env.NODE_ENV,
				srcDirExists,
				selectedDir: dir,
			});
		} catch (error) {
			// local dev
			// n8n binary is inside the bin folder, so we need to go up two levels
			modulesDir = path.resolve(process.argv[1], '../../n8n-atom/dist/modules');
			this.logger.debug('Using local development modules directory', {
				modulesDir,
				processArgv: process.argv[1],
			});
		}

		this.logger.debug('Modules directory resolved', { modulesDir });

		const modulesToProcess = modules ?? this.eligibleModules;
		this.logger.debug('Processing modules', {
			modulesToProcess,
			count: modulesToProcess.length,
		});

		for (const moduleName of modulesToProcess) {
			this.logger.debug(`Loading module: ${moduleName}`, { moduleName, modulesDir });

			try {
				const modulePath = `${modulesDir}/${moduleName}/${moduleName}.module`;
				this.logger.debug(`Attempting to import module from standard path`, { modulePath });
				await import(modulePath);
				this.logger.debug(`Successfully loaded module from standard path`, {
					moduleName,
					modulePath,
				});
			} catch (error) {
				this.logger.debug(`Standard path import failed, trying EE path`, {
					moduleName,
					error: error instanceof Error ? error.message : 'Unknown error',
				});

				try {
					const eeModulePath = `${modulesDir}/${moduleName}.ee/${moduleName}.module`;
					this.logger.debug(`Attempting to import module from EE path`, { eeModulePath });
					await import(eeModulePath);
					this.logger.debug(`Successfully loaded module from EE path`, {
						moduleName,
						eeModulePath,
					});
				} catch (eeError) {
					this.logger.error(`Failed to load module from both standard and EE paths`, {
						moduleName,
						standardPath: `${modulesDir}/${moduleName}/${moduleName}.module`,
						eePath: `${modulesDir}/${moduleName}.ee/${moduleName}.module`,
						standardError: error instanceof Error ? error.message : 'Unknown error',
						eeError: eeError instanceof Error ? eeError.message : 'Unknown error',
					});
					throw new MissingModuleError(moduleName, eeError instanceof Error ? eeError.message : '');
				}
			}
		}

		this.logger.debug('All modules imported, processing module metadata');

		const moduleClasses = this.moduleMetadata.getClasses();
		this.logger.debug('Retrieved module classes from metadata', {
			moduleClassCount: moduleClasses.length,
		});

		for (const ModuleClass of moduleClasses) {
			const className = ModuleClass.name;
			this.logger.debug(`Processing module class: ${className}`, { className });

			try {
				const entities = await Container.get(ModuleClass).entities?.();
				if (entities?.length) {
					this.entities.push(...entities);
					this.logger.debug(`Added entities from module class`, {
						className,
						entityCount: entities.length,
						totalEntities: this.entities.length,
					});
				} else {
					this.logger.debug(`No entities found for module class`, { className });
				}

				const loadDir = await Container.get(ModuleClass).loadDir?.();
				if (loadDir) {
					this.loadDirs.push(loadDir);
					this.logger.debug(`Added load directory from module class`, {
						className,
						loadDir,
						totalLoadDirs: this.loadDirs.length,
					});
				} else {
					this.logger.debug(`No load directory found for module class`, { className });
				}
			} catch (error) {
				this.logger.error(`Error processing module class: ${className}`, {
					className,
					error: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined,
				});
				throw error;
			}
		}

		this.logger.debug('Module loading process completed', {
			totalModulesProcessed: modulesToProcess.length,
			totalEntitiesLoaded: this.entities.length,
			totalLoadDirs: this.loadDirs.length,
		});
	}

	/**
	 * Calls `init` on each eligible module.
	 *
	 * This will do things like registering routes, setup timers or other module
	 * specific setup.
	 *
	 * `ModuleRegistry.loadModules` must have been called before.
	 */
	async initModules() {
		for (const [moduleName, moduleEntry] of this.moduleMetadata.getEntries()) {
			const { licenseFlag, class: ModuleClass } = moduleEntry;

			if (licenseFlag && !this.licenseState.isLicensed(licenseFlag)) {
				this.logger.debug(`Skipped init for unlicensed module "${moduleName}"`);
				continue;
			}

			await Container.get(ModuleClass).init?.();

			const moduleSettings = await Container.get(ModuleClass).settings?.();

			if (moduleSettings) this.settings.set(moduleName, moduleSettings);

			this.logger.debug(`Initialized module "${moduleName}"`);

			this.activeModules.push(moduleName);
		}
	}

	async shutdownModule(moduleName: ModuleName) {
		const moduleEntry = this.moduleMetadata.get(moduleName);

		if (!moduleEntry) {
			this.logger.debug('Skipping shutdown for unregistered module', { moduleName });
			return;
		}

		await Container.get(moduleEntry.class).shutdown?.();

		const index = this.activeModules.indexOf(moduleName);
		if (index > -1) this.activeModules.splice(index, 1);

		this.logger.debug(`Shut down module "${moduleName}"`);
	}

	isActive(moduleName: ModuleName) {
		return this.activeModules.includes(moduleName);
	}

	getActiveModules() {
		return this.activeModules;
	}
}

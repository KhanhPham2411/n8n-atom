import { PackageDirectoryLoader } from './package-directory-loader';

/**
 * This loader extends PackageDirectoryLoader to load node and credentials lazily, if possible
 */
export class LazyPackageDirectoryLoader extends PackageDirectoryLoader {
	override async loadAll() {
		// [BUG-NPX-DEBUG] Log lazy loading attempt
		this.logger.info(
			`[BUG-NPX-DEBUG] LazyPackageDirectoryLoader.loadAll: attempting lazy load for packageName="${this.packageJson.name}" from directory="${this.directory}"`,
		);

		try {
			this.known.nodes = await this.readJSON('dist/known/nodes.json');
			this.known.credentials = await this.readJSON('dist/known/credentials.json');

			this.types.nodes = await this.readJSON('dist/types/nodes.json');
			this.types.credentials = await this.readJSON('dist/types/credentials.json');

			// [BUG-NPX-DEBUG] Log successful lazy load
			this.logger.info(
				`[BUG-NPX-DEBUG] LazyPackageDirectoryLoader.loadAll: lazy load SUCCESS for "${this.packageJson.name}", known.nodes count=${Object.keys(this.known.nodes).length}`,
			);
			this.logger.info(
				`[BUG-NPX-DEBUG] LazyPackageDirectoryLoader.loadAll: checking for manualTrigger: ${'manualTrigger' in this.known.nodes}`,
			);

			if (this.removeNonIncludedNodes) {
				const allowedNodes: typeof this.known.nodes = {};
				for (const nodeType of this.includeNodes) {
					if (nodeType in this.known.nodes) {
						allowedNodes[nodeType] = this.known.nodes[nodeType];
					}
				}
				this.known.nodes = allowedNodes;

				this.types.nodes = this.types.nodes.filter((nodeType) =>
					this.includeNodes.includes(nodeType.name),
				);
			}

			if (this.excludeNodes.length) {
				for (const nodeType of this.excludeNodes) {
					delete this.known.nodes[nodeType];
				}

				this.types.nodes = this.types.nodes.filter(
					(nodeType) => !this.excludeNodes.includes(nodeType.name),
				);
			}

			this.logger.debug(`Lazy-loading nodes and credentials from ${this.packageJson.name}`, {
				nodes: this.types.nodes?.length ?? 0,
				credentials: this.types.credentials?.length ?? 0,
			});

			this.isLazyLoaded = true;

			return; // We can load nodes and credentials lazily now
		} catch (error) {
			// [BUG-NPX-DEBUG] Log lazy loading failure with error details
			this.logger.warn(
				`[BUG-NPX-DEBUG] LazyPackageDirectoryLoader.loadAll: lazy load FAILED for "${this.packageJson.name}", error: ${(error as Error).message}`,
			);
			this.logger.debug("Can't enable lazy-loading");
			await super.loadAll();
		}
	}
}

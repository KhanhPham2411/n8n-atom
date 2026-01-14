import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class MistralCloudApi implements ICredentialType {
	name = 'mistralCloudApi';

	displayName = 'Mistral AI API';

	documentationUrl = 'mistral';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
		},
	];

	authenticate = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '={{"Bearer " + $credentials.apiKey}}',
			},
		},
	} as const;
}

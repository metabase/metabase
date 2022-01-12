export interface Engine {
  "display-name": string;
  "superseded-by": string | undefined;
}

export interface Version {
  tag: string;
}

export interface Settings {
  "enable-public-sharing": boolean;
  "enable-xrays": boolean;
  engines: Record<string, Engine>;
  "deprecation-notice-version": string | undefined;
  "show-database-syncing-modal": boolean;
  "show-homepage-data": boolean;
  "show-homepage-xrays": boolean;
  "show-homepage-pin-message": boolean;
  "slack-token": string | undefined;
  "slack-token-valid?": boolean;
  "slack-app-token": string | undefined;
  "slack-files-channel": string | undefined;
  version: Version;
}

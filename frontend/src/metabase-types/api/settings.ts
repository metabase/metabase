export interface EngineSourceContact {
  name?: string;
  address?: string;
}
export interface EngineSource {
  type?: "official" | "community" | "partner";
  contact?: EngineSourceContact;
}

export interface Engine {
  "driver-name": string;
  "superseded-by": string | undefined;
  source: EngineSource;
}

export interface Version {
  tag: string;
}

export type LocaleData = [string, string];

export interface Settings {
  "available-locales": LocaleData[] | undefined;
  "enable-public-sharing": boolean;
  "enable-xrays": boolean;
  engines: Record<string, Engine>;
  "is-hosted?": boolean;
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

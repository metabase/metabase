export interface Engine {
  "driver-name": string;
  "superseded-by": string | undefined;
  source: EngineSource;
}
export interface EngineSource {
  type?: "official" | "community" | "partner";
  contact?: EngineSourceContact;
}

export interface EngineSourceContact {
  name?: string;
  address?: string;
}

export interface FontFile {
  src: string;
  fontWeight: number;
  fontFormat: FontFormat;
}

export type FontFormat = "woff" | "woff2" | "truetype";

export interface Version {
  tag: string;
}

export type LocaleData = [string, string];

export type LoadingMessage =
  | "doing-science"
  | "running-query"
  | "loading-results";

export interface Settings {
  "application-font": string;
  "application-font-files": FontFile[] | null;
  "available-fonts": string[];
  "available-locales": LocaleData[] | undefined;
  "enable-public-sharing": boolean;
  "enable-xrays": boolean;
  engines: Record<string, Engine>;
  "is-hosted?": boolean;
  "deprecation-notice-version": string | undefined;
  "loading-message": LoadingMessage;
  "show-database-syncing-modal": boolean;
  "show-homepage-data": boolean;
  "show-homepage-xrays": boolean;
  "show-homepage-pin-message": boolean;
  "show-lighthouse-illustration": boolean | null;
  "show-metabot": boolean | null;
  "slack-token": string | undefined;
  "slack-token-valid?": boolean;
  "slack-app-token": string | undefined;
  "slack-files-channel": string | undefined;
  version: Version;
}

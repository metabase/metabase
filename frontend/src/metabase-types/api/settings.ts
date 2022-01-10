export interface Version {
  tag: string;
}

export interface Settings {
  "enable-public-sharing"?: boolean;
  "enable-xrays"?: boolean;
  "deprecation-notice-version"?: string;
  "show-database-syncing-modal"?: boolean;
  "show-homepage-data"?: boolean;
  "show-homepage-xrays"?: boolean;
  "show-homepage-pin-message"?: boolean;
  "slack-token"?: string;
  "slack-token-valid?"?: boolean;
  "slack-app-token"?: string;
  "slack-files-channel"?: string;
  version?: Version;
}

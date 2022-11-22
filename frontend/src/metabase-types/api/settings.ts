export interface FormattingSettings {
  "type/Temporal"?: DateFormattingSettings;
  "type/Number"?: NumberFormattingSettings;
  "type/Currency"?: CurrencyFormattingSettings;
}

export interface DateFormattingSettings {
  date_style?: string;
  date_separator?: string;
  date_abbreviate?: boolean;
  time_style?: string;
}

export interface NumberFormattingSettings {
  number_separators?: string;
}

export interface CurrencyFormattingSettings {
  currency?: string;
  currency_style?: string;
  currency_in_header?: boolean;
}

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

export type TokenStatusStatus = "unpaid" | "past-due" | string;

export interface TokenStatus {
  status?: TokenStatusStatus;
}

export interface TokenFeatures {
  advanced_config: boolean;
  advanced_permissions: boolean;
  audit_app: boolean;
  content_management: boolean;
  embedding: boolean;
  hosting: boolean;
  sandboxes: boolean;
  sso: boolean;
  whitelabel: boolean;
}

export interface SettingDefinition {
  key: string;
  env_name: string;
  is_env_setting: boolean;
}

export interface Settings {
  "application-font": string;
  "application-font-files": FontFile[] | null;
  "available-fonts": string[];
  "available-locales": LocaleData[] | null;
  "custom-formatting": FormattingSettings;
  "deprecation-notice-version"?: string;
  "email-configured?": boolean;
  "embedding-secret-key"?: string;
  "enable-embedding": boolean;
  "enable-nested-queries": boolean;
  "enable-public-sharing": boolean;
  "enable-xrays": boolean;
  "experimental-enable-actions": boolean;
  "google-auth-auto-create-accounts-domain": string | null;
  "google-auth-client-id": string | null;
  "google-auth-configured": boolean;
  "google-auth-enabled": boolean;
  "is-hosted?": boolean;
  "jwt-enabled"?: boolean;
  "jwt-configured"?: boolean;
  "ldap-configured?": boolean;
  "ldap-enabled": boolean;
  "loading-message": LoadingMessage;
  "persisted-models-enabled": boolean;
  "saml-configured"?: boolean;
  "saml-enabled"?: boolean;
  "session-cookies": boolean | null;
  "show-database-syncing-modal": boolean;
  "show-homepage-data": boolean;
  "show-homepage-pin-message": boolean;
  "show-homepage-xrays": boolean;
  "show-lighthouse-illustration": boolean;
  "show-metabot": boolean;
  "site-locale": string;
  "site-url": string;
  "slack-app-token": string | null;
  "slack-files-channel": string | null;
  "slack-token": string | null;
  "slack-token-valid?": boolean;
  "token-features": TokenFeatures;
  "token-status": TokenStatus | null;
  engines: Record<string, Engine>;
  version: Version;
}

export type SettingKey = keyof Settings;

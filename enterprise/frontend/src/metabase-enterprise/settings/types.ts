import type { Settings } from "metabase-types/api";
import type { SettingsState, State } from "metabase-types/store";

export interface EnterpriseState extends State {
  settings: EnterpriseSettingsState;
}

interface EnterpriseSettingsState extends SettingsState {
  values: EnterpriseSettings;
}

export type IllustrationSettingValue = "default" | "none" | "custom";

export interface EnterpriseSettings extends Settings {
  "application-colors"?: Record<string, string>;
  "application-logo-url"?: string;
  "login-page-illustration"?: IllustrationSettingValue;
  "login-page-illustration-custom"?: string;
  "landing-page-illustration"?: IllustrationSettingValue;
  "landing-page-illustration-custom"?: string;
  "no-data-illustration"?: IllustrationSettingValue;
  "no-data-illustration-custom"?: string;
  "no-object-illustration"?: IllustrationSettingValue;
  "no-object-illustration-custom"?: string;
  "landing-page"?: string;
  "ee-ai-features-enabled"?: boolean;
  "ee-openai-api-key"?: string;
  "ee-openai-model"?: string;
  "saml-user-provisioning-enabled?"?: boolean;
  "scim-enabled"?: boolean | null;
  "scim-base-url"?: string;
  "send-new-sso-user-admin-email?"?: boolean;
  /**
   * @deprecated
   */
  application_logo_url?: string;
}

export type EnterpriseSettingKey = keyof EnterpriseSettings;

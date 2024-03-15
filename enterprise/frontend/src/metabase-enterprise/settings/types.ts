import type { Settings } from "metabase-types/api";
import type { SettingsState, State } from "metabase-types/store";

export interface EnterpriseState extends State {
  settings: EnterpriseSettingsState;
}

interface EnterpriseSettingsState extends SettingsState {
  values: EnterpriseSettings;
}

export type IllustrationSettingValue = "default" | "no-illustration" | "custom";

export interface EnterpriseSettings extends Settings {
  "application-colors"?: Record<string, string>;
  "application-logo-url"?: string;
  "login-page-illustration"?: IllustrationSettingValue;
  "login-page-illustration-custom"?: string;
  "landing-page-illustration"?: IllustrationSettingValue;
  "landing-page-illustration-custom"?: string;
  "no-question-results-illustration"?: IllustrationSettingValue;
  "no-question-results-illustration-custom"?: string;
  "no-search-results-illustration"?: IllustrationSettingValue;
  "no-search-results-illustration-custom"?: string;
  "landing-page"?: string;
  "ee-ai-features-enabled"?: boolean;
  "ee-openai-api-key"?: string;
  "ee-openai-model"?: string;
  /**
   * @deprecated
   */
  application_logo_url?: string;
}

export type EnterpriseSettingKey = keyof EnterpriseSettings;

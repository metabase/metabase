import type { Settings } from "metabase-types/api";
import type { SettingsState, State } from "metabase-types/store";

export interface EnterpriseState extends State {
  settings: EnterpriseSettingsState;
}

interface EnterpriseSettingsState extends SettingsState {
  values: EnterpriseSettings;
}

export type IllustrationValue = "default" | "no-illustration" | "custom";

export interface EnterpriseSettings extends Settings {
  "application-colors"?: Record<string, string>;
  "application-logo-url"?: string;
  "login-page-illustration"?: IllustrationValue;
  "login-page-illustration-custom"?: string;
  "landing-page-illustration"?: IllustrationValue;
  "landing-page-illustration-custom"?: string;
  "no-question-results-illustration"?: IllustrationValue;
  "no-question-results-illustration-custom"?: string;
  "no-search-results-illustration"?: IllustrationValue;
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

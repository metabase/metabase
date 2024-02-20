import type { Settings } from "metabase-types/api";
import type { SettingsState, State } from "metabase-types/store";

export interface EnterpriseState extends State {
  settings: EnterpriseSettingsState;
}

interface EnterpriseSettingsState extends SettingsState {
  values: EnterpriseSettings;
}

export interface EnterpriseSettings extends Settings {
  "application-colors"?: Record<string, string>;
  "application-logo-url"?: string;
  "landing-page"?: string;
  "llm-autodescription": boolean;
  /**
   * @deprecated
   */
  application_logo_url?: string;
}

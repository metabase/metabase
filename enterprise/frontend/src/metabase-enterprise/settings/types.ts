import { Settings } from "metabase-types/api";
import { State } from "metabase-types/store";

export interface EnterpriseState extends State {
  settings: EnterpriseSettingsState;
}

interface EnterpriseSettingsState {
  values: EnterpriseSettings;
}

export interface EnterpriseSettings extends Settings {
  "application-colors"?: Record<string, string>;
  "application-logo-url"?: string;
  /**
   * @deprecated
   */
  application_logo_url?: string;
  /**
   * @deprecated
   */
  application_colors?: string;
}

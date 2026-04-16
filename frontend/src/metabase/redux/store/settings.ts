import type { EnterpriseSettings } from "metabase-types/api";

export interface SettingsState {
  values: EnterpriseSettings;
  loading: boolean;
}

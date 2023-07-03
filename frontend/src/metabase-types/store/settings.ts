import { Settings } from "metabase-types/api";

export interface SettingsState {
  values: Settings;
  loading: boolean;
}

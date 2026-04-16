import type { SettingsState, State } from "metabase/redux/store";
import type { EnterpriseSettings } from "metabase-types/api";

export interface EnterpriseState extends State {
  settings: EnterpriseSettingsState;
}

interface EnterpriseSettingsState extends SettingsState {
  values: EnterpriseSettings;
}

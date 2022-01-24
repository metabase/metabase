import { AdminState } from "./admin";
import { SettingsState } from "./settings";

export interface State {
  admin: AdminState;
  settings: SettingsState;
}

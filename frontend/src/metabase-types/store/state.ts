import { AdminState } from "./admin";
import { EntitiesState } from "./entities";
import { SettingsState } from "./settings";
export interface State {
  admin: AdminState;
  settings: SettingsState;
  entities: EntitiesState;
}

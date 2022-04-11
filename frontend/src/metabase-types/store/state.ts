import { User } from "metabase-types/types/User";
import { AdminState } from "./admin";
import { EntitiesState } from "./entities";
import { SettingsState } from "./settings";
export interface State {
  currentUser: User;
  admin: AdminState;
  settings: SettingsState;
  entities: EntitiesState;
}

import { User } from "metabase-types/api";
import { AdminState } from "./admin";
import { EntitiesState } from "./entities";
import { FormState } from "./forms";
import { SettingsState } from "./settings";
import { SetupState } from "./setup";

export interface State {
  currentUser: User;
  admin: AdminState;
  entities: EntitiesState;
  form: FormState;
  settings: SettingsState;
  setup: SetupState;
}

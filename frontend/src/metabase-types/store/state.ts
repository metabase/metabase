import { User } from "metabase-types/api";
import { AdminState } from "./admin";
import { AppState } from "./app";
import { EmbedState } from "./embed";
import { EntitiesState } from "./entities";
import { FormState } from "./forms";
import { SettingsState } from "./settings";
import { SetupState } from "./setup";

export interface State {
  admin: AdminState;
  app: AppState;
  currentUser: User;
  embed: EmbedState;
  entities: EntitiesState;
  form: FormState;
  settings: SettingsState;
  setup: SetupState;
}

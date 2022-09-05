import { User } from "metabase-types/api";
import { AdminState } from "./admin";
import { AppState } from "./app";
import { EmbedState } from "./embed";
import { EntitiesState } from "./entities";
import { FormState } from "./forms";
import { QueryBuilderState } from "./qb";
import { SettingsState } from "./settings";
import { SetupState } from "./setup";

export interface State {
  admin: AdminState;
  app: AppState;
  currentUser: User;
  embed: EmbedState;
  entities: EntitiesState;
  form: FormState;
  qb: QueryBuilderState;
  settings: SettingsState;
  setup: SetupState;
}

export type Dispatch<T = unknown> = (action: T) => void;

export type GetState = () => State;

export type ReduxAction<Type = string, Payload = any> = {
  type: Type;
  payload: Payload;
};

import { User } from "metabase-types/api";
import { AdminState } from "./admin";
import { AppState } from "./app";
import { DashboardState } from "./dashboard";
import { EmbedState } from "./embed";
import { EntitiesState } from "./entities";
import { MetabotState } from "./metabot";
import { QueryBuilderState } from "./qb";
import { ParametersState } from "./parameters";
import { SettingsState } from "./settings";
import { SetupState } from "./setup";
import { FileUploadState } from "./upload";

export interface State {
  admin: AdminState;
  app: AppState;
  currentUser: User | null;
  dashboard: DashboardState;
  embed: EmbedState;
  entities: EntitiesState;
  metabot: MetabotState;
  qb: QueryBuilderState;
  parameters: ParametersState;
  settings: SettingsState;
  setup: SetupState;
  upload: FileUploadState;
}

export type Dispatch<T = any> = (action: T) => void;

export type GetState = () => State;

export type ReduxAction<Type = string, Payload = any> = {
  type: Type;
  payload: Payload;
  error?: string;
};

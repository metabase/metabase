import type { User } from "metabase-types/api";
import type { AdminState } from "./admin";
import type { AppState } from "./app";
import type { DashboardState } from "./dashboard";
import type { EmbedState } from "./embed";
import type { EntitiesState } from "./entities";
import type { MetabotState } from "./metabot";
import type { QueryBuilderState } from "./qb";
import type { ParametersState } from "./parameters";
import type { SettingsState } from "./settings";
import type { SetupState } from "./setup";
import type { FileUploadState } from "./upload";
import type { AuthState } from "./auth";

export interface State {
  admin: AdminState;
  app: AppState;
  auth: AuthState;
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

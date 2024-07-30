import type { RouterState } from "react-router-redux";

import type { User } from "metabase-types/api";

import type { AdminState } from "./admin";
import type { AppState } from "./app";
import type { AuthState } from "./auth";
import type { DashboardState } from "./dashboard";
import type { DownloadsState } from "./downloads";
import type { EmbedState } from "./embed";
import type { EntitiesState } from "./entities";
import type { MetabotState } from "./metabot";
import type { ParametersState } from "./parameters";
import type { QueryBuilderState } from "./qb";
import type { RequestsState } from "./requests";
import type { SettingsState } from "./settings";
import type { SetupState } from "./setup";
import type { FileUploadState } from "./upload";

type modalName = null | "collection" | "dashboard" | "action";
export interface State {
  admin: AdminState;
  app: AppState;
  auth: AuthState;
  currentUser: User | null;
  dashboard: DashboardState;
  embed: EmbedState;
  entities: EntitiesState;
  metabot: MetabotState;
  parameters: ParametersState;
  qb: QueryBuilderState;
  requests: RequestsState;
  routing: RouterState;
  settings: SettingsState;
  setup: SetupState;
  upload: FileUploadState;
  modal: modalName;
  downloads: DownloadsState;
}

export type Dispatch<T = any> = (action: T) => unknown | Promise<unknown>;

export type GetState = () => State;

export type ReduxAction<Type = string, Payload = any> = {
  type: Type;
  payload: Payload;
  error?: string;
};

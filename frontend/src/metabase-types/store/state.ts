import type { Location } from "history";

import type { Api } from "metabase/api/api";
import type { User } from "metabase-types/api";
import type { DocumentsState } from "metabase-types/store/documents";

import type { AdminState } from "./admin";
import type { AnalyticsExportState } from "./analytics-export";
import type { AppState } from "./app";
import type { AuthState } from "./auth";
import type { DashboardState } from "./dashboard";
import type { DownloadsState } from "./downloads";
import type { EmbedState } from "./embed";
import type { EmbeddingDataPickerState } from "./embedding-data-picker";
import type { EntitiesState } from "./entities";
import type { ModalState } from "./modal";
import type { ParametersState } from "./parameters";
import type { PulseState } from "./pulse";
import type { QueryBuilderState } from "./qb";
import type { RequestsState } from "./requests";
import type { SettingsState } from "./settings";
import type { SetupState } from "./setup";
import type { UndoState } from "./undo";
import type { FileUploadState } from "./upload";
import type { VisualizerState } from "./visualizer";

type MetabaseApiState = ReturnType<typeof Api.reducer>;

export interface RoutingState {
  // react-router-redux stores the last location under this key.
  // We only care that it has a pathname/hash/search shape like history.Location.
  locationBeforeTransitions?: Location & { query?: any };
}

export interface State {
  admin: AdminState;
  analyticsExport: AnalyticsExportState;
  app: AppState;
  auth: AuthState;
  currentUser: User | null;
  dashboard: DashboardState;
  embed: EmbedState;
  embeddingDataPicker: EmbeddingDataPickerState;
  entities: EntitiesState;
  parameters: ParametersState;
  pulse: PulseState;
  qb: QueryBuilderState;
  requests: RequestsState;
  routing: RoutingState;
  settings: SettingsState;
  setup: SetupState;
  upload: FileUploadState;
  modal: ModalState;
  undo: UndoState;
  downloads: DownloadsState;
  visualizer: {
    past: VisualizerState[];
    present: VisualizerState;
    future: VisualizerState[];
  };
  "metabase-api": MetabaseApiState;
  documents: DocumentsState;
}

export type Dispatch<T = any> = (action: T) => unknown | Promise<unknown>;

export type GetState = () => State;

export type ReduxAction<Type = string, Payload = any> = {
  type: Type;
  payload: Payload;
  error?: string;
};

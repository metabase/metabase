import type { Api } from "metabase/api/api";
import type { DocumentsState } from "metabase/redux/store/documents";
import type { RouterState } from "metabase/router";

import type { AdminState } from "./admin";
import type { AnalyticsExportState } from "./analytics-export";
import type { AppState } from "./app";
import type { AuthState } from "./auth";
import type { DashboardState } from "./dashboard";
import type { DownloadsState } from "./downloads";
import type { EmbedState } from "./embed";
import type { EmbeddingDataPickerState } from "./embedding-data-picker";
import type { EntitiesState } from "./entities";
import type { MetabotState } from "./metabot";
import type { ModalState } from "./modal";
import type { ParametersState } from "./parameters";
import type { PulseState } from "./pulse";
import type { QueryBuilderState } from "./qb";
import type { SetupState } from "./setup";
import type { UndoState } from "./undo";
import type { FileUploadState } from "./upload";
import type { VisualizerState } from "./visualizer";

type MetabaseApiState = ReturnType<typeof Api.reducer>;

export interface State {
  admin: AdminState;
  analyticsExport: AnalyticsExportState;
  app: AppState;
  auth: AuthState;
  // NOTE: there is deliberately no `currentUser` key — the current user is not
  // redux state. It lives in the `getCurrentUser` RTK Query cache; read it via
  // `getUser`. Tests seed it through `StoreSeedState`.
  dashboard: DashboardState;
  embed: EmbedState;
  embeddingDataPicker: EmbeddingDataPickerState;
  entities: EntitiesState;
  parameters: ParametersState;
  pulse: PulseState;
  qb: QueryBuilderState;
  routing: RouterState;
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
  metabot: MetabotState;
}

export type Dispatch<T = any> = (action: T) => unknown | Promise<unknown>;

export type GetState = () => State;

export type ReduxAction<Type = string, Payload = any> = {
  type: Type;
  payload: Payload;
  error?: string;
};

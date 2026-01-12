import type { SdkStoreState } from "embedding-sdk-bundle/store/types";
import type { EnterpriseState } from "metabase-enterprise/settings/types";
import { createMockUser } from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";

import { createMockAdminState } from "./admin";
import { createMockAppState } from "./app";
import { createMockAuthState } from "./auth";
import { createMockDashboardState } from "./dashboard";
import { createMockEmbedState } from "./embed";
import { createMockEmbeddingDataPickerState } from "./embedding-data-picker";
import { createMockNormalizedEntitiesState } from "./entities";
import { createMockModalState } from "./modal";
import { createMockParametersState } from "./parameters";
import { createMockQueryBuilderState } from "./qb";
import { createMockRequestsState } from "./requests";
import { createMockRoutingState } from "./routing";
import { createMockSettingsState } from "./settings";
import { createMockSetupState } from "./setup";
import { createMockUploadState } from "./upload";
import { createMockVisualizerState } from "./visualizer";

export function createMockState<S extends Pick<SdkStoreState, "sdk">>(
  opts?: S,
): SdkStoreState;
export function createMockState(
  opts?: Partial<State> | Partial<EnterpriseState>,
): State;
export function createMockState(opts: any) {
  return {
    admin: createMockAdminState(),
    app: createMockAppState(),
    auth: createMockAuthState(),
    currentUser: createMockUser(),
    dashboard: createMockDashboardState(),
    embed: createMockEmbedState(),
    embeddingDataPicker: createMockEmbeddingDataPickerState(),
    entities: createMockNormalizedEntitiesState(),
    parameters: createMockParametersState(),
    qb: createMockQueryBuilderState(),
    requests: createMockRequestsState(),
    routing: createMockRoutingState(),
    settings: createMockSettingsState(),
    setup: createMockSetupState(),
    upload: createMockUploadState(),
    visualizer: {
      past: [],
      present: createMockVisualizerState(),
      future: [],
    },
    modal: createMockModalState(),
    ...opts,
  };
}

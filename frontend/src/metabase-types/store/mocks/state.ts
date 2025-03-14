import type { SdkStoreState } from "embedding-sdk/store/types";
import type { EnterpriseState } from "metabase-enterprise/settings/types";
import type { Settings } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";

import { createMockAdminState } from "./admin";
import { createMockAppState } from "./app";
import { createMockAuthState } from "./auth";
import { createMockDashboardState } from "./dashboard";
import { createMockEmbedState } from "./embed";
import { createMockNormalizedEntitiesState } from "./entities";
import { createMockParametersState } from "./parameters";
import { createMockQueryBuilderState } from "./qb";
import { createMockRequestsState } from "./requests";
import { createMockRoutingState } from "./routing";
import { createMockSettingsState } from "./settings";
import { createMockSetupState } from "./setup";
import { createMockUploadState } from "./upload";

type APIStoreOpts = {
  settings?: Partial<Settings>;
};

export function createMockState<S extends Pick<SdkStoreState, "sdk">>(
  opts?: S,
): SdkStoreState;
export function createMockState(
  opts?: (Partial<State> & APIStoreOpts) | Partial<EnterpriseState>,
): State;
export function createMockState(opts: any) {
  return {
    admin: createMockAdminState(),
    app: createMockAppState(),
    auth: createMockAuthState(),
    currentUser: createMockUser(),
    dashboard: createMockDashboardState(),
    embed: createMockEmbedState(),
    entities: createMockNormalizedEntitiesState(),
    parameters: createMockParametersState(),
    qb: createMockQueryBuilderState(),
    requests: createMockRequestsState(),
    routing: createMockRoutingState(),
    setup: createMockSetupState(),
    upload: createMockUploadState(),
    modal: null,
    "metabase-api": {
      queries: {
        ...createMockSettingsState(opts?.settings ?? {}),
      },
    },
    ...opts,
  };
}

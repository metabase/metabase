import type { SdkState } from "embedding-sdk/store/types";
import type { EnterpriseState } from "metabase-enterprise/settings/types";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

export const createMockSdkState = (
  opts?: Partial<State> | Partial<EnterpriseState> | Partial<SdkState>,
): SdkState => ({
  ...createMockState(),
  embeddingSessionToken: {
    token: null,
    loading: false,
    error: null,
  },
  ...opts,
});

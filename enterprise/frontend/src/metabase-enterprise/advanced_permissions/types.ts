import type { PartialBy } from "metabase/core/types";
import type { EnterpriseSharedState } from "metabase-enterprise/shared/reducer";
import type { EnterpriseState } from "metabase-enterprise/shared/types";
import type { DatabaseId, GroupId, Impersonation } from "metabase-types/api";
import type { RequestState, RequestsState } from "metabase-types/store";

import type { AdvancedPermissionsState } from "./reducer";

export type ImpersonationParams = { groupId: GroupId; databaseId: DatabaseId };

export interface AdvancedPermissionsStoreState extends EnterpriseState {
  requests: RequestsState & {
    plugins: {
      advancedPermissionsPlugin: {
        policies: Record<string, RequestState>;
      };
    };
  };
  plugins: {
    shared: EnterpriseSharedState;
    advancedPermissionsPlugin: AdvancedPermissionsState;
  };
}

export type ImpersonationDraft = PartialBy<Impersonation, "attribute">;

export type ImpersonationModalParams = {
  groupId: string;
  impersonatedDatabaseId?: string;
  databaseId?: string;
};

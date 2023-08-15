import { DatabaseId, GroupId, Impersonation } from "metabase-types/api";
import { PartialBy } from "metabase/core/types";

import { RequestState } from "metabase-types/store/requests";
import { EnterpriseState } from "metabase-enterprise/shared/types";
import { EnterpriseSharedState } from "metabase-enterprise/shared/reducer";
import { AdvancedPermissionsState } from "./reducer";

export type ImpersonationParams = { groupId: GroupId; databaseId: DatabaseId };

export interface AdvancedPermissionsStoreState extends EnterpriseState {
  requests: {
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

import { DatabaseId, GroupId, Impersonation } from "metabase-types/api";
import { PartialBy } from "metabase/core/types";
import { State } from "metabase-types/store";
import { RequestState } from "metabase-types/store/requests";
import { AdvancedPermissionsState } from "./reducer";

export type ImpersonationParams = { groupId: GroupId; databaseId: DatabaseId };

export interface AdvancedPermissionsStoreState extends State {
  requests: {
    plugins: {
      advancedPermissionsPlugin: {
        policies: Record<string, RequestState>;
      };
    };
  };
  plugins: {
    advancedPermissionsPlugin: AdvancedPermissionsState;
  };
}

export type ImpersonationDraft = PartialBy<Impersonation, "attribute">;

export type ImpersonationModalParams = {
  groupId: string;
} & (
  | {
      impersonatedDatabaseId: string;
    }
  | { databaseId: string }
);

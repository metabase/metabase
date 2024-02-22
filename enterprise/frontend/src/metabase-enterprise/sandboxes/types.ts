import type { EnterpriseSharedState } from "metabase-enterprise/shared/reducer";
import type { EnterpriseState } from "metabase-enterprise/shared/types";
import type { GroupTableAccessPolicy } from "metabase-types/api";
import type { RequestsState, RequestState } from "metabase-types/store";

export type GroupTableAccessPolicyParams = { groupId: string; tableId: string };

export interface SandboxesState extends EnterpriseState {
  requests: RequestsState & {
    plugins: {
      sandboxesPlugin: {
        policies: Record<string, RequestState>;
      };
      shared: EnterpriseSharedState;
    };
  };
  plugins: {
    sandboxingPlugin: {
      groupTableAccessPolicies: Record<string, GroupTableAccessPolicy>;
      originalGroupTableAccessPolicies: Record<string, GroupTableAccessPolicy>;
    };
    shared: EnterpriseSharedState;
  };
}

export type GroupTableAccessPolicyDraft = Pick<
  GroupTableAccessPolicy,
  "card_id" | "table_id" | "group_id"
> & {
  attribute_remappings: {
    [key: string]: string | null;
  };
};

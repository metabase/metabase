import type { EnterpriseSharedState } from "metabase-enterprise/shared/reducer";
import type { EnterpriseState } from "metabase-enterprise/shared/types";
import type {
  DimensionRef,
  GroupTableAccessPolicy,
  UserAttributeKey,
} from "metabase-types/api";
import type { RequestState, RequestsState } from "metabase-types/store";

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
    [key: string]: string | DimensionRef | null;
  };
};

export type MappingEditorEntry<T = string> = {
  key: UserAttributeKey;
  value: T;
};

export type DataAttributeMap<T = string> = Record<UserAttributeKey, T>;

export type MappingType<T = string> = Record<UserAttributeKey, T>;

import type { EnterpriseSharedState } from "metabase-enterprise/shared/reducer";
import type { EnterpriseState } from "metabase-enterprise/shared/types";
import type {
  GroupId,
  GroupTableAccessPolicy,
  ParameterTarget,
  TableId,
  UserAttributeKey,
} from "metabase-types/api";

// ids as they arrive in the sandboxing modal route params
export type RawGroupTableAccessPolicyParams = {
  groupId?: string;
  tableId?: string;
};

// route-param strings and UPDATE_DATA_PERMISSION payload numbers template
// into the same policy key
export type GroupTableAccessPolicyParams = {
  groupId: GroupId | string;
  tableId: TableId | string;
};

export interface SandboxesState extends EnterpriseState {
  plugins: {
    sandboxingPlugin: {
      groupTableAccessPolicies: Record<string, GroupTableAccessPolicy>;
    };
    shared: EnterpriseSharedState;
  };
}

export type GroupTableAccessPolicyDraft = Pick<
  GroupTableAccessPolicy,
  "card_id" | "table_id" | "group_id"
> & {
  attribute_remappings: {
    [key: string]: string | ParameterTarget | null;
  };
};

export type MappingEditorEntry<T = string> = {
  key: UserAttributeKey;
  value: T;
};

export type DataAttributeMap<T = string> = Record<UserAttributeKey, T>;

export type MappingType<T = string> = Record<UserAttributeKey, T>;

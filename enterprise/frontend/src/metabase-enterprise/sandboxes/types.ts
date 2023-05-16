import { GroupTableAccessPolicy, UserAttribute } from "metabase-types/api";
import { State } from "metabase-types/store";
import { RequestState } from "metabase-types/store/requests";

export type GroupTableAccessPolicyParams = { groupId: string; tableId: string };

export interface SandboxesState extends State {
  requests: {
    plugins: {
      sandboxesPlugin: {
        policies: Record<string, RequestState>;
      };
    };
  };
  plugins: {
    sandboxingPlugin: {
      groupTableAccessPolicies: Record<string, GroupTableAccessPolicy>;
      originalGroupTableAccessPolicies: Record<string, GroupTableAccessPolicy>;
      attributes: UserAttribute[];
    };
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

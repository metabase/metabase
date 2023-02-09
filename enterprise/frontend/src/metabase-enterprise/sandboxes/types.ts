import { GroupTableAccessPolicy, UserAttribute } from "metabase-types/api";
import { State } from "metabase-types/store";

export type GroupTableAccessPolicyParams = { groupId: string; tableId: string };

export interface SandboxesState extends State {
  requests: {
    plugins: {
      sandboxesPlugin: {
        policies: Record<string, any>;
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

import type {
  AIToolKey,
  GroupInfo,
  MetabotGroupPermission,
} from "metabase-types/api";

export type AiFeatureAccessTableProps = {
  groups: GroupInfo[];
  groupPermissions: MetabotGroupPermission[];
  advanced: boolean;
  activeTab: "user-groups" | "tenant-groups";
  onPermissionChange: (
    groupId: number,
    toolKey: AIToolKey,
    value: "yes" | "no",
  ) => void;
};

export type PermissionsByTool = Partial<
  Record<AIToolKey, MetabotGroupPermission>
>;

export type AiFeatureAccessRow = {
  id: number;
  group: GroupInfo;
  permissions: PermissionsByTool;
  isAdminGroup: boolean;
};

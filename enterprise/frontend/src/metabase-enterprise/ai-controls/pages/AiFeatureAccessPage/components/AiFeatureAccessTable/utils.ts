import type {
  AIToolKey,
  GroupInfo,
  MetabotGroupPermission,
} from "metabase-types/api";

import type { GroupTab, SwitchAdvancedMode } from "../../../../types";

export type AiFeatureAccessTableProps = {
  groups: GroupInfo[];
  groupPermissions: MetabotGroupPermission[];
  advanced: boolean;
  activeTab: GroupTab;
  isEnablingAdvanced: boolean;
  onEnableAdvanced: SwitchAdvancedMode;
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

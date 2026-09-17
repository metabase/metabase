import type {
  GroupInfo,
  McpGroupPermission,
  McpTool,
} from "metabase-types/api";

export type McpToolsGridRow =
  | { kind: "bucket"; id: string; scope: string; label: string }
  | { kind: "tool"; id: string; tool: McpTool };

export type McpToolsGridColumn = {
  group: GroupInfo;
  permission: McpGroupPermission;
  isAdminGroup: boolean;
};

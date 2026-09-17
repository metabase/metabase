import { t } from "ttag";

import {
  getGroupNameLocalized,
  getGroupSortOrder,
  isAdminGroup,
} from "metabase/common/utils/groups";
import type {
  GroupId,
  GroupInfo,
  McpGroupPermission,
  McpTool,
  McpToolAccess,
} from "metabase-types/api";

import type { McpToolsGridColumn, McpToolsGridRow } from "./types";

export type McpToolBucket = { scope: string; tools: McpTool[] };

const SCOPE_LABELS: Record<string, () => string> = {
  "agent:content:read": () => t`Read`,
  "agent:query:run": () => t`Query`,
  "agent:sql:run": () => t`Raw SQL`,
  "agent:content:write": () => t`Write`,
  "agent:delivery:write": () => t`Deliveries`,
};

const SCOPE_ORDER = Object.keys(SCOPE_LABELS);

export function getScopeLabel(scope: string): string {
  return SCOPE_LABELS[scope]?.() ?? scope;
}

export function getDisabledPermission(groupId: GroupId): McpGroupPermission {
  return { group_id: groupId, mcp_enabled: false, tool_access: {} };
}

function resolveToolAccess(
  permission: McpGroupPermission,
  tool: McpTool,
): McpToolAccess {
  return (
    permission.tool_access[tool.name] ??
    (tool.default_access === "allowed" ? "yes" : "no")
  );
}

export function isToolAllowed(
  permission: McpGroupPermission,
  tool: McpTool,
): boolean {
  return (
    permission.mcp_enabled && resolveToolAccess(permission, tool) === "yes"
  );
}

export type ToolsAccessState = "all" | "some" | "none";

export function getToolsAccessState(
  permission: McpGroupPermission,
  tools: McpTool[],
): ToolsAccessState {
  const allowedCount = tools.filter((tool) =>
    isToolAllowed(permission, tool),
  ).length;
  if (allowedCount === 0) {
    return "none";
  }
  return allowedCount === tools.length ? "all" : "some";
}

function toolAccessEntries(
  tools: McpTool[],
  access: McpToolAccess,
): Record<string, McpToolAccess> {
  return Object.fromEntries(
    tools.map((tool): [string, McpToolAccess] => [tool.name, access]),
  );
}

function enableGroupWithOnlyTools(
  permission: McpGroupPermission,
  allTools: McpTool[],
  tools: McpTool[],
): McpGroupPermission {
  return {
    ...permission,
    mcp_enabled: true,
    tool_access: {
      ...permission.tool_access,
      ...toolAccessEntries(allTools, "no"),
      ...toolAccessEntries(tools, "yes"),
    },
  };
}

export function setToolsAllowed(
  permission: McpGroupPermission,
  allTools: McpTool[],
  tools: McpTool[],
  allowed: boolean,
): McpGroupPermission {
  if (allowed && !permission.mcp_enabled) {
    return enableGroupWithOnlyTools(permission, allTools, tools);
  }
  const next: McpGroupPermission = {
    ...permission,
    tool_access: {
      ...permission.tool_access,
      ...toolAccessEntries(tools, allowed ? "yes" : "no"),
    },
  };
  if (allowed) {
    return next;
  }
  const anyAllowed = allTools.some(
    (other) => resolveToolAccess(next, other) === "yes",
  );
  return anyAllowed ? next : { ...next, mcp_enabled: false };
}

function getScopeRank(scope: string): number {
  const index = SCOPE_ORDER.indexOf(scope);
  return index === -1 ? SCOPE_ORDER.length : index;
}

export function groupToolsByScope(tools: McpTool[]): McpToolBucket[] {
  const toolsByScope = new Map<string, McpTool[]>();
  for (const tool of tools) {
    const scopeTools = toolsByScope.get(tool.scope);
    if (scopeTools) {
      scopeTools.push(tool);
    } else {
      toolsByScope.set(tool.scope, [tool]);
    }
  }

  return [...toolsByScope.entries()]
    .sort(([a], [b]) => getScopeRank(a) - getScopeRank(b))
    .map(([scope, scopeTools]) => ({ scope, tools: scopeTools }));
}

export function buildGridRows(tools: McpTool[]): McpToolsGridRow[] {
  return groupToolsByScope(tools).flatMap<McpToolsGridRow>((bucket) => [
    {
      kind: "bucket",
      id: `bucket:${bucket.scope}`,
      scope: bucket.scope,
      label: getScopeLabel(bucket.scope),
    },
    ...bucket.tools.map<McpToolsGridRow>((tool) => ({
      kind: "tool",
      id: `tool:${tool.name}`,
      tool,
    })),
  ]);
}

function compareGroups(a: GroupInfo, b: GroupInfo): number {
  return (
    getGroupSortOrder(a) - getGroupSortOrder(b) ||
    getGroupNameLocalized(a).localeCompare(getGroupNameLocalized(b))
  );
}

export function buildGridColumns(
  groups: GroupInfo[],
  permissionsByGroup: Record<GroupId, McpGroupPermission>,
): McpToolsGridColumn[] {
  return [...groups].sort(compareGroups).map((group) => ({
    group,
    permission: permissionsByGroup[group.id] ?? getDisabledPermission(group.id),
    isAdminGroup: isAdminGroup(group),
  }));
}

export function filterGridColumns(
  columns: McpToolsGridColumn[],
  query: string,
): McpToolsGridColumn[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return columns;
  }
  return columns.filter((column) =>
    getGroupNameLocalized(column.group).toLowerCase().includes(needle),
  );
}

import { t } from "ttag";

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

// Without the pinning, every default-allowed tool would light up on the first check.
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
    toolsByScope.set(tool.scope, [
      ...(toolsByScope.get(tool.scope) ?? []),
      tool,
    ]);
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

const ADMIN_GROUP_RANK = 0;
const MAGIC_GROUP_RANK = 1;
const PLAIN_GROUP_RANK = 2;

function getGroupRank(group: GroupInfo): number {
  if (group.magic_group_type === "admin") {
    return ADMIN_GROUP_RANK;
  }
  return group.magic_group_type === null ? PLAIN_GROUP_RANK : MAGIC_GROUP_RANK;
}

function compareGroups(a: GroupInfo, b: GroupInfo): number {
  const rankA = getGroupRank(a);
  const rankB = getGroupRank(b);
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  return rankA === PLAIN_GROUP_RANK ? a.name.localeCompare(b.name) : 0;
}

export function buildGridColumns(
  groups: GroupInfo[],
  permissionsByGroup: Record<GroupId, McpGroupPermission>,
): McpToolsGridColumn[] {
  return [...groups].sort(compareGroups).map((group) => ({
    group,
    permission: permissionsByGroup[group.id] ?? getDisabledPermission(group.id),
    isAdminGroup: group.magic_group_type === "admin",
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
    column.group.name.toLowerCase().includes(needle),
  );
}

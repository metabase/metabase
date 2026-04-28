import type { WorkspaceId } from "metabase-types/api";

const WORKSPACES_ROOT = "/data-studio/workspaces";

export function workspaceList() {
  return WORKSPACES_ROOT;
}

export function workspace(workspaceId: WorkspaceId) {
  return `${WORKSPACES_ROOT}/${workspaceId}`;
}

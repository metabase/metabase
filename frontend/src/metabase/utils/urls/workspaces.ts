import type { WorkspaceId } from "metabase-types/api";

const WORKSPACES_ROOT = "/data-studio/workspaces";
const WORKSPACE_INSTANCE_ROOT = "/data-studio/workspace";

export function workspaceList() {
  return WORKSPACES_ROOT;
}

export function workspace(workspaceId: WorkspaceId) {
  return `${WORKSPACES_ROOT}/${workspaceId}`;
}

export function workspaceInstance() {
  return WORKSPACE_INSTANCE_ROOT;
}

export function workspaceInstanceOverview() {
  return `${WORKSPACE_INSTANCE_ROOT}/overview`;
}

export function workspaceInstanceRemappings() {
  return `${WORKSPACE_INSTANCE_ROOT}/remappings`;
}

export function workspaceInstanceChanges() {
  return `${WORKSPACE_INSTANCE_ROOT}/changes`;
}

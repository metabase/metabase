import type { WorkspaceId } from "metabase-types/api";

const WORKSPACES_ROOT_URL = `/data-studio/workspaces`;
const WORKSPACE_INSTANCE_URL = `/data-studio/workspace`;

export function workspaceList() {
  return WORKSPACES_ROOT_URL;
}

export function newWorkspace() {
  return `${WORKSPACES_ROOT_URL}/new`;
}

export function workspace(workspaceId: WorkspaceId) {
  return `${WORKSPACES_ROOT_URL}/${workspaceId}`;
}

export function workspaceDatabases(workspaceId: WorkspaceId) {
  return `${workspace(workspaceId)}/databases`;
}

export function workspaceInstance() {
  return WORKSPACE_INSTANCE_URL;
}

export function workspaceInstanceOverview() {
  return `${WORKSPACE_INSTANCE_URL}/overview`;
}

export function workspaceInstanceQueryExecution() {
  return `${WORKSPACE_INSTANCE_URL}/query-execution`;
}

export function workspaceInstanceRemappings() {
  return `${WORKSPACE_INSTANCE_URL}/remappings`;
}

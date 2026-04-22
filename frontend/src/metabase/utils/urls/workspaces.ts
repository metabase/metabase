import type { WorkspaceId } from "metabase-types/api";

const WORKSPACES_ROOT_URL = `/data-studio/workspaces`;

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

import type { WorkspaceId } from "metabase-types/api";

const WORKSPACES_ROOT_URL = `/data-studio/workspaces`;

export function workspaceList() {
  return WORKSPACES_ROOT_URL;
}

export function newWorkspace() {
  return `${WORKSPACES_ROOT_URL}/new`;
}

export function workspace(id: WorkspaceId) {
  return `${WORKSPACES_ROOT_URL}/${id}`;
}

export function workspaceInstance() {
  return `${WORKSPACES_ROOT_URL}/instance`;
}

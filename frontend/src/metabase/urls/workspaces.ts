import type { WorkspaceId } from "metabase-types/api";

const WORKSPACES_ROOT_URL = `/data-studio/workspaces`;

export function workspaces() {
  return WORKSPACES_ROOT_URL;
}

export function workspace(id: WorkspaceId) {
  return `${WORKSPACES_ROOT_URL}/${id}`;
}

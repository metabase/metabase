import fetchMock from "fetch-mock";

import type { DatabaseId, Workspace, WorkspaceId } from "metabase-types/api";

export function setupListWorkspacesEndpoint(workspaces: Workspace[]) {
  fetchMock.get("path:/api/ee/workspace", workspaces);
}

export function setupCreateWorkspaceEndpoint(workspace: Workspace) {
  fetchMock.post("path:/api/ee/workspace", workspace);
}

export function setupUpdateWorkspaceEndpoint(workspace: Workspace) {
  fetchMock.put(`path:/api/ee/workspace/${workspace.id}`, workspace);
}

export function setupDeleteWorkspaceEndpoint(id: WorkspaceId) {
  fetchMock.delete(`path:/api/ee/workspace/${id}`, { id, deleted: true });
}

export function setupCreateWorkspaceDatabaseEndpoint(
  workspaceId: WorkspaceId,
  workspace: Workspace,
) {
  fetchMock.post(`path:/api/ee/workspace/${workspaceId}/database`, workspace);
}

export function setupUpdateWorkspaceDatabaseEndpoint(
  workspaceId: WorkspaceId,
  databaseId: DatabaseId,
  workspace: Workspace,
) {
  fetchMock.put(
    `path:/api/ee/workspace/${workspaceId}/database/${databaseId}`,
    workspace,
  );
}

export function setupDeleteWorkspaceDatabaseEndpoint(
  workspaceId: WorkspaceId,
  databaseId: DatabaseId,
  workspace: Workspace,
) {
  fetchMock.delete(
    `path:/api/ee/workspace/${workspaceId}/database/${databaseId}`,
    workspace,
  );
}

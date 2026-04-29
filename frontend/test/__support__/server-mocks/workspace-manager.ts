import fetchMock from "fetch-mock";

import type { DatabaseId, Workspace, WorkspaceId } from "metabase-types/api";

export function setupListWorkspacesEndpoint(workspaces: Workspace[]) {
  fetchMock.get("path:/api/ee/workspace-manager", workspaces);
}

export function setupCreateWorkspaceEndpoint(workspace: Workspace) {
  fetchMock.post("path:/api/ee/workspace-manager", workspace);
}

export function setupUpdateWorkspaceEndpoint(workspace: Workspace) {
  fetchMock.put(`path:/api/ee/workspace-manager/${workspace.id}`, workspace);
}

export function setupDeleteWorkspaceEndpoint(id: WorkspaceId) {
  fetchMock.delete(`path:/api/ee/workspace-manager/${id}`, {
    id,
    deleted: true,
  });
}

export function setupCreateWorkspaceDatabaseEndpoint(
  workspaceId: WorkspaceId,
  workspace: Workspace,
) {
  fetchMock.post(
    `path:/api/ee/workspace-manager/${workspaceId}/database`,
    workspace,
  );
}

export function setupUpdateWorkspaceDatabaseEndpoint(
  workspaceId: WorkspaceId,
  databaseId: DatabaseId,
  workspace: Workspace,
) {
  fetchMock.put(
    `path:/api/ee/workspace-manager/${workspaceId}/database/${databaseId}`,
    workspace,
  );
}

export function setupDeleteWorkspaceDatabaseEndpoint(
  workspaceId: WorkspaceId,
  databaseId: DatabaseId,
  workspace: Workspace,
) {
  fetchMock.delete(
    `path:/api/ee/workspace-manager/${workspaceId}/database/${databaseId}`,
    workspace,
  );
}

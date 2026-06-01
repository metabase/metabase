import fetchMock from "fetch-mock";

import type { DatabaseId, Workspace, WorkspaceId } from "metabase-types/api";

const BASE_URL = "path:/api/ee/workspace-manager";

export function setupListWorkspacesEndpoint(workspaces: Workspace[]) {
  fetchMock.get(BASE_URL, workspaces);
}

export function setupGetWorkspaceEndpoint(workspace: Workspace) {
  fetchMock.get(`${BASE_URL}/${workspace.id}`, workspace);
}

export function setupCreateWorkspaceEndpoint(workspace: Workspace) {
  fetchMock.post(BASE_URL, workspace);
}

export function setupUpdateWorkspaceEndpoint(workspace: Workspace) {
  fetchMock.put(`${BASE_URL}/${workspace.id}`, workspace);
}

export function setupDeleteWorkspaceEndpoint(workspaceId: WorkspaceId) {
  fetchMock.delete(`${BASE_URL}/${workspaceId}`, {
    id: workspaceId,
    deleted: true,
  });
}

export function setupDeleteWorkspaceEndpointError(workspaceId: WorkspaceId) {
  fetchMock.delete(`${BASE_URL}/${workspaceId}`, { status: 500 });
}

export function setupCreateWorkspaceDatabaseEndpoint(workspace: Workspace) {
  fetchMock.post(`${BASE_URL}/${workspace.id}/database`, workspace);
}

export function setupUpdateWorkspaceDatabaseEndpoint(
  workspace: Workspace,
  databaseId: DatabaseId,
) {
  fetchMock.put(
    `${BASE_URL}/${workspace.id}/database/${databaseId}`,
    workspace,
  );
}

export function setupDeleteWorkspaceDatabaseEndpoint(
  workspace: Workspace,
  databaseId: DatabaseId,
) {
  fetchMock.delete(
    `${BASE_URL}/${workspace.id}/database/${databaseId}`,
    workspace,
  );
}

export function setupDeleteWorkspaceDatabaseEndpointError(
  workspaceId: WorkspaceId,
  databaseId: DatabaseId,
) {
  fetchMock.delete(`${BASE_URL}/${workspaceId}/database/${databaseId}`, {
    status: 500,
  });
}

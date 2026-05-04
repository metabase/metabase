import fetchMock from "fetch-mock";

import type { DatabaseId, Workspace, WorkspaceId } from "metabase-types/api";

export function setupListWorkspacesEndpoint(workspaces: Workspace[]) {
  fetchMock.get("path:/api/ee/workspace-manager", workspaces);
}

export function setupGetWorkspaceEndpoint(workspace: Workspace) {
  fetchMock.get(`path:/api/ee/workspace-manager/${workspace.id}`, workspace);
}

export function setupGetWorkspaceEndpointError(id: WorkspaceId, status = 500) {
  fetchMock.get(`path:/api/ee/workspace-manager/${id}`, {
    status,
    body: { message: "Boom" },
  });
}

export function setupCreateWorkspaceEndpoint(workspace: Workspace) {
  fetchMock.post("path:/api/ee/workspace-manager", workspace);
}

export function setupCreateWorkspaceEndpointError(
  status = 400,
  message = "Workspace name already taken",
) {
  fetchMock.post("path:/api/ee/workspace-manager", {
    status,
    body: { message },
  });
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

export function setupDeleteWorkspaceEndpointError(
  id: WorkspaceId,
  status = 500,
) {
  fetchMock.delete(`path:/api/ee/workspace-manager/${id}`, {
    status,
    body: { message: "Boom" },
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

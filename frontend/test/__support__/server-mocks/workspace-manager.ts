import fetchMock from "fetch-mock";

import type {
  DeleteWorkspaceResponse,
  Workspace,
  WorkspaceId,
} from "metabase-types/api";

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

export function setupDeleteWorkspaceEndpoint(
  workspaceId: WorkspaceId,
  response?: Partial<DeleteWorkspaceResponse>,
) {
  fetchMock.delete(`${BASE_URL}/${workspaceId}`, {
    id: workspaceId,
    deleted: true,
    ...response,
  });
}

export function setupDeleteWorkspaceEndpointError(workspaceId: WorkspaceId) {
  fetchMock.delete(`${BASE_URL}/${workspaceId}`, { status: 500 });
}

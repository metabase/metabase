import fetchMock from "fetch-mock";

import type {
  Workspace,
  WorkspaceCheckoutResponse,
  WorkspaceId,
  WorkspaceItem,
  WorkspaceListResponse,
  WorkspaceProblem,
} from "metabase-types/api";

export function setupWorkspaceProblemsEndpoint(
  workspaceId: WorkspaceId,
  problems: WorkspaceProblem[] | Promise<WorkspaceProblem[]> = [],
) {
  fetchMock.get(`path:/api/ee/workspace/${workspaceId}/problem`, problems);
}

export function setupWorkspacesEndpoint(workspaces: WorkspaceItem[] = []) {
  const response: WorkspaceListResponse = {
    items: workspaces,
    limit: null,
    offset: null,
  };
  fetchMock.get("path:/api/ee/workspace", response);
}

export function setupWorkspaceCheckoutEndpoint(
  checkout: Partial<WorkspaceCheckoutResponse> = {},
) {
  const response: WorkspaceCheckoutResponse = {
    checkout_disabled: null,
    workspaces: [],
    transforms: [],
    ...checkout,
  };
  fetchMock.get("express:/api/ee/workspace/checkout", response);
}

export function setupCreateWorkspaceEndpoint(workspace: Workspace) {
  fetchMock.post("path:/api/ee/workspace", workspace);
}

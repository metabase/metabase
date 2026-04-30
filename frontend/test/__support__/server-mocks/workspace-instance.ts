import fetchMock from "fetch-mock";

import type { TableRemapping, WorkspaceInstance } from "metabase-types/api";

export function setupGetCurrentWorkspaceEndpoint(workspace: WorkspaceInstance) {
  fetchMock.get("path:/api/ee/workspace-instance/current", workspace);
}

export function setupGetCurrentWorkspaceEndpointError(status = 500) {
  fetchMock.get("path:/api/ee/workspace-instance/current", {
    status,
    body: { message: "Boom" },
  });
}

export function setupListTableRemappingsEndpoint(remappings: TableRemapping[]) {
  fetchMock.get("path:/api/ee/workspace-instance/remappings", remappings);
}

export function setupListTableRemappingsEndpointError(status = 500) {
  fetchMock.get("path:/api/ee/workspace-instance/remappings", {
    status,
    body: { message: "Boom" },
  });
}

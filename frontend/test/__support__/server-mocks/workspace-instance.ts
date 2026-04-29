import fetchMock from "fetch-mock";

import type { TableRemapping, WorkspaceInstance } from "metabase-types/api";

export function setupGetCurrentWorkspaceEndpoint(workspace: WorkspaceInstance) {
  fetchMock.get("path:/api/ee/workspace-instance/current", workspace);
}

export function setupListTableRemappingsEndpoint(remappings: TableRemapping[]) {
  fetchMock.get("path:/api/ee/workspace-instance/remappings", remappings);
}

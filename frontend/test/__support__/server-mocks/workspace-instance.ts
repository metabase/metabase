import fetchMock from "fetch-mock";

import type { TableRemapping, WorkspaceInstance } from "metabase-types/api";

const BASE_URL = "path:/api/ee/workspace-instance";

export function setupGetCurrentWorkspaceEndpoint(
  workspace: WorkspaceInstance | null,
) {
  fetchMock.get(`${BASE_URL}/current`, { data: workspace });
}

export function setupDeleteWorkspaceInstanceEndpoint() {
  fetchMock.delete(`${BASE_URL}/current`, 204);
}

export function setupListTableRemappingsEndpoint(remappings: TableRemapping[]) {
  fetchMock.get(`${BASE_URL}/table-remappings`, remappings);
}

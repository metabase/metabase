import fetchMock from "fetch-mock";

import type { CurrentWorkspace, TableRemapping } from "metabase-types/api";

const BASE_URL = "path:/api/ee/workspace-instance";

export function setupGetCurrentWorkspaceEndpoint(
  workspace: CurrentWorkspace | null,
) {
  fetchMock.get(`${BASE_URL}/current`, { data: workspace });
}

export function setupDeleteCurrentWorkspaceEndpoint() {
  fetchMock.delete(`${BASE_URL}/current`, 204);
}

export function setupListTableRemappingsEndpoint(remappings: TableRemapping[]) {
  fetchMock.get(`${BASE_URL}/table-remappings`, remappings);
}

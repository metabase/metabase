import fetchMock from "fetch-mock";

import type { TableRemapping, WorkspaceInstance } from "metabase-types/api";

const BASE_URL = "path:/api/ee/workspace-instance";

export function setupGetCurrentWorkspaceEndpoint(
  workspace: WorkspaceInstance | null,
) {
  fetchMock.get(
    `${BASE_URL}/current`,
    workspace ?? { status: 204, body: null },
  );
}

export function setupListTableRemappingsEndpoint(remappings: TableRemapping[]) {
  fetchMock.get(`${BASE_URL}/table-remappings`, remappings);
}

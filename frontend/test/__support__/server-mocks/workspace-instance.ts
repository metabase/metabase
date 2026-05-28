import fetchMock from "fetch-mock";

import type { TableRemapping } from "metabase-types/api";

const BASE_URL = "path:/api/ee/workspace-instance";

export function setupListTableRemappingsEndpoint(remappings: TableRemapping[]) {
  fetchMock.get(`${BASE_URL}/table-remappings`, remappings);
}

export function setupDeleteTableRemappingsEndpoint() {
  fetchMock.delete(`${BASE_URL}/table-remappings`, 204);
}

import fetchMock from "fetch-mock";
import type { PermissionsGraph } from "metabase-types/api";

export const setupPermissionsGraphEndpoint = (
  permissionsGraph: PermissionsGraph,
) => {
  fetchMock.get("path:/api/permissions/graph", permissionsGraph);
};

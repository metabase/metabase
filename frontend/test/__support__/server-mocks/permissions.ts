import fetchMock from "fetch-mock";
import type {
  CollectionPermissionsGraph,
  PermissionsGraph,
} from "metabase-types/api";

export const setupPermissionsGraphEndpoint = (
  permissionsGraph: PermissionsGraph,
) => {
  fetchMock.get("path:/api/permissions/graph", permissionsGraph);
};

export const setupCollectionPermissionsGraphEndpoint = (
  permissionsGraph: CollectionPermissionsGraph,
) => {
  fetchMock.get("path:/api/collection/graph", permissionsGraph);
  fetchMock.put(
    "path:/api/collection/graph",
    (url: string, opts: any, req: { body: any }) => {
      const body = JSON.parse(req.body);
      body.revision += 1;
      return body;
    },
  );
};

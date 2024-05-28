import fetchMock from "fetch-mock";

import type {
  CollectionPermissionsGraph,
  Group,
  Database,
} from "metabase-types/api";
import { createMockPermissionsGraph } from "metabase-types/api/mocks/permissions";

export const setupPermissionsGraphEndpoints = (
  groups: Omit<Group, "members">[],
  databases: Database[],
) => {
  fetchMock.get(
    "path:/api/permissions/graph",
    createMockPermissionsGraph({ groups, databases }),
  );

  groups.forEach(group => {
    fetchMock.get(
      `path:/api/permissions/graph/group/${group.id}`,
      createMockPermissionsGraph({ groups: [group], databases }),
    );
  });

  databases.forEach(database => {
    fetchMock.get(
      `path:/api/permissions/graph/db/${database.id}`,
      createMockPermissionsGraph({ groups, databases: [database] }),
    );
  });
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

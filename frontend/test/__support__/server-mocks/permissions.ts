import fetchMock from "fetch-mock";

import type {
  CollectionPermissionsGraph,
  Database,
  Group,
  ListUserMembershipsResponse,
} from "metabase-types/api";
import { createMockPermissionsGraph } from "metabase-types/api/mocks";

export const setupPermissionsGraphEndpoints = (
  groups: Omit<Group, "members">[],
  databases: Database[],
) => {
  fetchMock.get(
    "path:/api/permissions/graph",
    createMockPermissionsGraph({ groups, databases }),
  );

  groups.forEach((group) => {
    fetchMock.get(
      `path:/api/permissions/graph/group/${group.id}`,
      createMockPermissionsGraph({ groups: [group], databases }),
    );
  });

  databases.forEach((database) => {
    fetchMock.get(
      `path:/api/permissions/graph/db/${database.id}`,
      createMockPermissionsGraph({ groups, databases: [database] }),
    );
  });
};

export const setupCollectionPermissionsGraphEndpoint = (
  initialPermissionsGraph: CollectionPermissionsGraph,
) => {
  // Use a mutable state so that GET returns updated data after PUT
  let currentGraph = { ...initialPermissionsGraph };

  fetchMock.get("path:/api/collection/graph", () => currentGraph);
  fetchMock.put("path:/api/collection/graph", (call) => {
    const body = JSON.parse(call.options?.body as string);
    // Update the current graph with the new data
    currentGraph = {
      ...body,
      revision: body.revision + 1,
    };
    return currentGraph;
  });
};

export const setupPermissionMembershipEndpoint = (
  memberships: ListUserMembershipsResponse,
) => {
  fetchMock.get("path:/api/permissions/membership", memberships);
};

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
  permissionsGraph: CollectionPermissionsGraph,
) => {
  fetchMock.get("path:/api/collection/graph", permissionsGraph);
  fetchMock.put("path:/api/collection/graph", (call) => {
    // Unjustified type cast. FIXME
    const body = JSON.parse(call.options?.body as string);
    body.revision += 1;
    return body;
  });
};

/**
 * `GET /api/permissions/membership`. Pass a function to let a test change what
 * a refetch returns.
 */
export const setupPermissionMembershipEndpoint = (
  memberships:
    | ListUserMembershipsResponse
    | (() => ListUserMembershipsResponse),
) => {
  fetchMock.get("path:/api/permissions/membership", () =>
    typeof memberships === "function" ? memberships() : memberships,
  );
};

const MEMBERSHIP_ID_PATH = /\/api\/permissions\/membership\/\d+/;

export const setupMembershipMutationEndpoints = () => {
  fetchMock.post("path:/api/permissions/membership", 204);
  fetchMock.put(MEMBERSHIP_ID_PATH, 204);
  fetchMock.delete(MEMBERSHIP_ID_PATH, 204);
};

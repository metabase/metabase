import fetchMock from "fetch-mock";

import type {
  CollectionPermissionsGraph,
  Database,
  DatabasePermissions,
  Group,
  GroupId,
  ListUserMembershipsResponse,
} from "metabase-types/api";
import { createMockPermissionsGraph } from "metabase-types/api/mocks";

export const setupPermissionsGraphEndpoints = (
  groups: Omit<Group, "members">[],
  databases: Database[],
  permissionsByGroupId: Partial<
    Record<GroupId, Partial<DatabasePermissions>>
  > = {},
) => {
  fetchMock.get(
    "path:/api/permissions/graph",
    createMockPermissionsGraph({ groups, databases, permissionsByGroupId }),
  );

  groups.forEach((group) => {
    fetchMock.get(
      `path:/api/permissions/graph/group/${group.id}`,
      createMockPermissionsGraph({
        groups: [group],
        databases,
        permissionsByGroupId,
      }),
    );
  });

  databases.forEach((database) => {
    fetchMock.get(
      `path:/api/permissions/graph/db/${database.id}`,
      createMockPermissionsGraph({
        groups,
        databases: [database],
        permissionsByGroupId,
      }),
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

export const setupPermissionMembershipEndpoint = (
  memberships: ListUserMembershipsResponse,
) => {
  fetchMock.get("path:/api/permissions/membership", memberships);
};

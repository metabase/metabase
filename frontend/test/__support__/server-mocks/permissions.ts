import fetchMock from "fetch-mock";

import type {
  CollectionPermissionsGraph,
  Database,
  Group,
  GroupTableAccessPolicy,
  ListUserMembershipsResponse,
  PermissionsGraph,
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

export const setupUpdatePermissionsGraphEndpoint = (
  graph: PermissionsGraph,
) => {
  fetchMock.put("path:/api/permissions/graph", graph);
};

// The real endpoint ignores a lone group_id or table_id and lists every policy
export const setupGroupTableAccessPoliciesEndpoint = (
  policies: GroupTableAccessPolicy[],
) => {
  fetchMock.get("path:/api/mt/gtap", policies);
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

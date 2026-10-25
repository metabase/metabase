import fetchMock from "fetch-mock";

import type {
  ApplicationPermissionsGraph,
  CollectionPermissionsGraph,
  Database,
  Group,
  GroupId,
  ListUserMembershipsResponse,
  UpdatePermissionsGraphResponse,
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

export const setupGroupPermissionsGraphEndpointError = (
  groupId: GroupId,
  message: string,
) => {
  fetchMock.get(`path:/api/permissions/graph/group/${groupId}`, {
    status: 500,
    body: { message },
  });
};

export const setupUpdatePermissionsGraphEndpoint = (
  response: UpdatePermissionsGraphResponse,
) => {
  fetchMock.put("path:/api/permissions/graph", response);
};

export const setupUpdatePermissionsGraphEndpointError = (message: string) => {
  fetchMock.put("path:/api/permissions/graph", {
    status: 409,
    body: { message },
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

export const setupUpdateCollectionPermissionsGraphEndpointError = (
  message: string,
) => {
  fetchMock.put("path:/api/collection/graph", {
    status: 409,
    body: { message },
  });
};

export const setupPermissionMembershipEndpoint = (
  memberships: ListUserMembershipsResponse,
) => {
  fetchMock.get("path:/api/permissions/membership", memberships);
};

export const setupApplicationPermissionsGraphEndpoint = (
  graph: ApplicationPermissionsGraph,
) => {
  fetchMock.get("path:/api/ee/advanced-permissions/application/graph", graph);
};

export const setupUpdateApplicationPermissionsGraphEndpoint = (
  response: ApplicationPermissionsGraph,
) => {
  fetchMock.put(
    "path:/api/ee/advanced-permissions/application/graph",
    response,
  );
};

export const setupUpdateApplicationPermissionsGraphEndpointError = (
  message: string,
) => {
  fetchMock.put("path:/api/ee/advanced-permissions/application/graph", {
    status: 409,
    body: { message },
  });
};

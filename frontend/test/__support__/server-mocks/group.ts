import fetchMock from "fetch-mock";

import type { Group, GroupListQuery } from "metabase-types/api";

type GroupListSource = Omit<Group, "members">[] | (() => GroupListQuery[]);

/**
 * `GET /api/permissions/group`. Pass a function to let a test change what a
 * refetch returns.
 */
export const setupGroupsEndpoint = (groups: GroupListSource) => {
  fetchMock.get("path:/api/permissions/group", () =>
    typeof groups === "function" ? groups() : groups,
  );
};

export const setupGroupEndpoint = (group: Group) => {
  fetchMock.get(`path:/api/permissions/group/${group.id}`, group);
};

const GROUP_ID_PATH = /\/api\/permissions\/group\/\d+/;

export const setupGroupMutationEndpoints = () => {
  fetchMock.put(GROUP_ID_PATH, 200);
  fetchMock.delete(GROUP_ID_PATH, 204);
};

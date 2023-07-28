import fetchMock from "fetch-mock";
import { Group } from "metabase-types/api";

export const setupGroupsEndpoint = (groups: Omit<Group, "members">[]) => {
  fetchMock.get("path:/api/permissions/group", groups);
};

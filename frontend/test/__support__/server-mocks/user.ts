import fetchMock from "fetch-mock";
import { UserListResult } from "metabase-types/api";

export function setupUsersEndpoints(users: UserListResult[]) {
  fetchMock.get("path:/api/user", users);
}

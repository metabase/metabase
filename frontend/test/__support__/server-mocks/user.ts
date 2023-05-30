import fetchMock from "fetch-mock";
import { User, UserListResult } from "metabase-types/api";

export function setupUsersEndpoints(users: UserListResult[]) {
  fetchMock.get("path:/api/user", users);
}

export function setupCurrentUserEndpoint(user: User) {
  fetchMock.get("path:/api/user/current", user);
}

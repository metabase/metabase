import fetchMock from "fetch-mock";
import type { User, UserAttribute, UserListResult } from "metabase-types/api";

export function setupUserEndpoints(user: UserListResult) {
  fetchMock.get(`path:/api/user/${user.id}`, user);
}

export function setupUsersEndpoints(users: UserListResult[]) {
  users.forEach(user => setupUserEndpoints(user));
  return fetchMock.get("path:/api/user", users);
}

export function setupCurrentUserEndpoint(user: User) {
  fetchMock.get("path:/api/user/current", user);
}

export function setupUserAttributesEndpoint(attributes: UserAttribute[]) {
  fetchMock.get(`path:/api/mt/user/attributes`, attributes);
}

export function setupUserRecipientsEndpoint({
  users,
}: {
  users: UserListResult[];
}) {
  fetchMock.get("path:/api/user/recipients", { data: users });
}

import fetchMock from "fetch-mock";

import type {
  User,
  UserAttributeKey,
  UserId,
  UserListResult,
} from "metabase-types/api";

export function setupUserEndpoints(user: UserListResult) {
  fetchMock.get(`path:/api/user/${user.id}`, user);
  fetchMock.put(`path:/api/user/${user.id}`, user);
}

export function setupPasswordResetUrlEndpoint(
  userId: UserId,
  resetUrl = `http://localhost:3000/auth/reset_password/${userId}_token`,
) {
  fetchMock.post(`path:/api/user/${userId}/password-reset-url`, {
    password_reset_url: resetUrl,
  });
}

export function setupUpdatePasswordEndpoint(userId: UserId) {
  fetchMock.put(`path:/api/user/${userId}/password`, {});
}

export function setupUsersEndpoints(users: UserListResult[]) {
  users.forEach((user) => setupUserEndpoints(user));
  return fetchMock.get("path:/api/user", { data: users, total: users.length });
}

export function setupCurrentUserEndpoint(user: User) {
  return fetchMock.get("path:/api/user/current", user);
}

export function setupUserAttributesEndpoint(attributes: UserAttributeKey[]) {
  fetchMock.get(`path:/api/mt/user/attributes`, attributes);
}

export function setupUserRecipientsEndpoint({
  users,
}: {
  users: UserListResult[];
}) {
  fetchMock.get("path:/api/user/recipients", { data: users });
}

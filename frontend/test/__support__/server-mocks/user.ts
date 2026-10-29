import fetchMock from "fetch-mock";

import type {
  GroupId,
  ListUserMembershipsResponse,
  ListUsersResponse,
  Membership,
  User,
  UserAttributeKey,
  UserId,
  UserListResult,
} from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";
import { isObject } from "metabase-types/guards/common";

export function setupUserEndpoints(user: UserListResult) {
  fetchMock.get(`path:/api/user/${user.id}`, user);
  fetchMock.put(`path:/api/user/${user.id}`, user);
}

/**
 * `PUT /api/user/:id` rejecting with a field validation failure, in the shape
 * the backend sends when a field fails its schema. Register it before
 * [[setupUserEndpoints]], whose success route would otherwise match first.
 */
export function setupUpdateUserFailureEndpoint(
  userId: UserId,
  errors: Record<string, string>,
) {
  fetchMock.put(`path:/api/user/${userId}`, {
    status: 400,
    body: { errors },
  });
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

export function setupDisconnectSlackEndpoint(
  userId: UserId,
  {
    status = 204,
    body,
    delay = 0,
  }: {
    status?: number;
    body?: { message: string };
    delay?: number;
  } = {},
) {
  fetchMock.delete(
    `path:/api/user/${userId}/slack`,
    { status, body },
    { delay },
  );
}

export function setupUsersEndpoints(users: UserListResult[]) {
  users.forEach((user) => setupUserEndpoints(user));
  return fetchMock.get("path:/api/user", { data: users, total: users.length });
}

const matchesUserQuery = (user: User, query: string) => {
  const needle = query.toLowerCase();
  return [user.first_name, user.last_name, user.email].some((field) =>
    field?.toLowerCase().includes(needle),
  );
};

const selectUsers = (users: User[], url: string): ListUsersResponse => {
  const params = new URL(url).searchParams;
  const status = params.get("status");
  const includeDeactivated = params.get("include_deactivated") === "true";
  const wantsEveryone =
    status === "all" || (status == null && includeDeactivated);
  const wantsDeactivated = status === "deactivated";
  const query = params.get("query");

  const matching = users.filter((user) => {
    if (!wantsEveryone && user.is_active === wantsDeactivated) {
      return false;
    }
    return query == null || matchesUserQuery(user, query);
  });

  const limitParam = params.get("limit");
  const limit = limitParam == null ? matching.length : Number(limitParam);
  const offset = Number(params.get("offset") ?? 0);

  return {
    data: matching.slice(offset, offset + limit),
    total: matching.length,
    limit,
    offset,
  };
};

const USER_ID_PATH = /\/api\/user\/(\d+)(\?|$)/;
const REACTIVATE_PATH = /\/api\/user\/(\d+)\/reactivate(\?|$)/;

const readRequestBody = async (
  request: Request | undefined,
): Promise<Record<string | number | symbol, unknown>> => {
  const body: unknown = await request?.clone().json();
  return isObject(body) ? body : {};
};

const readNullableName = (
  body: Record<string | number | symbol, unknown>,
  key: "first_name" | "last_name",
): string | null => {
  const value = body[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

const commonNameOf = (
  firstName: string | null,
  lastName: string | null,
  email: string,
) => [firstName, lastName].filter(Boolean).join(" ") || email;

const readGroupMemberships = (
  body: Record<string | number | symbol, unknown>,
  userId: UserId,
  nextMembershipId: () => number,
): Membership[] => {
  const requested = body.user_group_memberships;
  if (!Array.isArray(requested)) {
    return [];
  }
  return requested.flatMap((membership: unknown) => {
    if (!isObject(membership) || typeof membership.id !== "number") {
      return [];
    }
    return [
      {
        user_id: userId,
        group_id: membership.id,
        membership_id: nextMembershipId(),
        is_group_manager: membership.is_group_manager === true,
      },
    ];
  });
};

export interface UserCollection {
  /**
   * The list the endpoints read and write. Mutate it to model a change the
   * endpoints below do not make themselves.
   */
  users: User[];
  /**
   * The memberships the create endpoint recorded from `user_group_memberships`,
   * keyed by user, in the shape `GET /api/permissions/membership` returns.
   */
  memberships: ListUserMembershipsResponse;
}

/**
 * A mutable `/api/user` collection. The list endpoint filters by `query` and by
 * `status`/`include_deactivated` and pages by `limit`/`offset` the way the real
 * one does, and create, update, deactivate and reactivate write back to the
 * list, so a refetch after a mutation returns what the backend would return.
 */
export function setupUserCollectionEndpoints(
  initialUsers: User[],
  {
    nextUserId = 1000,
    adminGroupId,
  }: { nextUserId?: number; adminGroupId?: GroupId } = {},
): UserCollection {
  const collection: UserCollection = {
    users: [...initialUsers],
    memberships: {},
  };
  let userIdSequence = nextUserId;
  let membershipIdSequence = nextUserId;

  const findUser = (url: string, pattern: RegExp) => {
    const id = Number(pattern.exec(url)?.[1]);
    return collection.users.find((user) => user.id === id);
  };

  const replaceUser = (user: User) => {
    collection.users = collection.users.map((candidate) =>
      candidate.id === user.id ? user : candidate,
    );
    return user;
  };

  fetchMock.get("path:/api/user", (call) =>
    selectUsers(collection.users, call.url),
  );

  fetchMock.post("path:/api/user", async (call) => {
    const body = await readRequestBody(call.request);
    const email = typeof body.email === "string" ? body.email : "";
    const isEmailTaken = collection.users.some(
      (user) => user.email.toLowerCase() === email.toLowerCase(),
    );
    if (isEmailTaken) {
      return {
        status: 400,
        body: {
          errors: { email: "Email address already in use." },
          error_code: "email-already-in-use",
        },
      };
    }
    const firstName = readNullableName(body, "first_name");
    const lastName = readNullableName(body, "last_name");
    const id = userIdSequence++;
    const memberships = readGroupMemberships(
      body,
      id,
      () => membershipIdSequence++,
    );
    const created = createMockUser({
      id,
      email,
      first_name: firstName,
      last_name: lastName,
      common_name: commonNameOf(firstName, lastName, email),
      is_superuser: memberships.some(
        ({ group_id }) => group_id === adminGroupId,
      ),
    });
    collection.users = [...collection.users, created];
    collection.memberships = { ...collection.memberships, [id]: memberships };
    return created;
  });

  fetchMock.put(REACTIVATE_PATH, (call) => {
    const user = findUser(call.url, REACTIVATE_PATH);
    return user
      ? { body: replaceUser({ ...user, is_active: true }) }
      : { status: 404 };
  });

  fetchMock.get(USER_ID_PATH, (call) => {
    const user = findUser(call.url, USER_ID_PATH);
    return user ? { body: user } : { status: 404 };
  });

  fetchMock.put(USER_ID_PATH, async (call) => {
    const user = findUser(call.url, USER_ID_PATH);
    if (!user) {
      return { status: 404 };
    }
    const body = await readRequestBody(call.request);
    const firstName =
      "first_name" in body
        ? readNullableName(body, "first_name")
        : user.first_name;
    const lastName =
      "last_name" in body
        ? readNullableName(body, "last_name")
        : user.last_name;
    const email = typeof body.email === "string" ? body.email : user.email;
    return {
      body: replaceUser({
        ...user,
        first_name: firstName,
        last_name: lastName,
        email,
        common_name: commonNameOf(firstName, lastName, email),
      }),
    };
  });

  fetchMock.delete(USER_ID_PATH, (call) => {
    const user = findUser(call.url, USER_ID_PATH);
    if (!user) {
      return { status: 404 };
    }
    replaceUser({ ...user, is_active: false });
    return { status: 204 };
  });

  return collection;
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

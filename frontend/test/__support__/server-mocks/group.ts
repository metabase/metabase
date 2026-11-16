import fetchMock from "fetch-mock";

import type { Group, Member, UserListResult } from "metabase-types/api";
import { createMockGroup } from "metabase-types/api/mocks/group";

// The request body is whatever the spec under test just posted, so the shape is
// known here even though `JSON.parse` cannot say so.
const readRequestBody = (body: unknown): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(String(body));

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`expected a JSON object body, got ${String(body)}`);
  }

  return { ...parsed };
};

export const setupGroupsEndpoint = (groups: Omit<Group, "members">[]) => {
  // Resolved on each call, so a spec that pairs this with
  // `setupCreateGroupEndpoint` sees the new group when the list is refetched.
  fetchMock.get("path:/api/permissions/group", () => groups);
};

export const setupCreateGroupEndpoint = (groups: Omit<Group, "members">[]) => {
  fetchMock.post("path:/api/permissions/group", (call) => {
    const { name, is_tenant_group } = readRequestBody(call.options?.body);
    const group = createMockGroup({
      id: Math.max(0, ...groups.map(({ id }) => id)) + 1,
      name: String(name),
      is_tenant_group: Boolean(is_tenant_group),
      magic_group_type: null,
      member_count: 0,
    });

    groups.push(group);
    return group;
  });
};

export const setupGroupEndpoint = (group: Group) => {
  // Resolved on each call, so a spec that pairs this with
  // `setupCreateMembershipEndpoint` sees the new member on a refetch.
  fetchMock.get(`path:/api/permissions/group/${group.id}`, () => group);
};

export const setupCreateMembershipEndpoint = (
  group: Group,
  users: UserListResult[],
) => {
  fetchMock.post("path:/api/permissions/membership", (call) => {
    const { user_id } = readRequestBody(call.options?.body);
    const user = users.find(({ id }) => id === user_id);

    if (!user) {
      return 404;
    }

    const member: Member = {
      user_id: user.id,
      group_id: group.id,
      membership_id: group.members.length + 1,
      email: user.email,
      first_name: user.first_name ?? "",
      last_name: user.last_name ?? "",
      is_superuser: false,
    };

    group.members.push(member);
    return group.members;
  });
};

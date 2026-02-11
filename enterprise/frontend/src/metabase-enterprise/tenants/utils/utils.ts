import type { Collection, Group, User } from "metabase-types/api";

export const isExternalUsersGroup = (
  group: Pick<Group, "magic_group_type">,
) => {
  return group.magic_group_type === "all-external-users";
};

export const isTenantGroup = (group: Pick<Group, "is_tenant_group">) => {
  return !!group.is_tenant_group;
};

export const isExternalUser = (user?: Pick<User, "tenant_id">): boolean => {
  return Boolean(user && user.tenant_id !== null);
};

export const isTenantCollection = (
  collection: Partial<Pick<Collection, "namespace">>,
) => collection.namespace === "shared-tenant-collection";

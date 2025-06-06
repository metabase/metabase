import type { Collection, Group, User } from "metabase-types/api";

export const isExternalUsersGroup = (group: Pick<Group, "name">) => {
  return group.name === "All External Users";
};

export const isExternalUser = (user?: Pick<User, "tenant_id">) => {
  return user?.tenant_id !== null;
};

export const isTenantCollection = (collection: Collection) =>
  collection.type === "tenant";

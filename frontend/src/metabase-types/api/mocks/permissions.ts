import {
  Database,
  Group,
  GroupsPermissions,
  Impersonation,
  PermissionsGraph,
} from "metabase-types/api";

export const createMockPermissionsGraph = ({
  groups,
  databases,
}: {
  groups: Omit<Group, "members">[];
  databases: Database[];
}): PermissionsGraph => {
  const permissionGroups: GroupsPermissions = {};

  for (const group of groups) {
    for (const database of databases) {
      permissionGroups[group.id] = {
        [database.id]: {
          data: {
            native: "write",
            schemas: "all",
          },
          download: {
            native: "full",
            schemas: "full",
          },
        },
      };
    }
  }

  return {
    groups: permissionGroups,
    revision: 1,
  };
};

export const createMockImpersonation = (
  data: Partial<Impersonation>,
): Impersonation => {
  return {
    db_id: 1,
    group_id: 1,
    attribute: "foo",
    ...data,
  };
};

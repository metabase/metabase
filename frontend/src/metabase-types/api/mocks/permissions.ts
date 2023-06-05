import {
  Database,
  Group,
  GroupsPermissions,
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

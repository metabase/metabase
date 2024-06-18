import {
  DataPermission,
  DataPermissionValue,
} from "metabase/admin/permissions/types";
import type {
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
          [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
          [DataPermission.CREATE_QUERIES]:
            DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
          [DataPermission.DOWNLOAD]: {
            native: DataPermissionValue.FULL,
            schemas: DataPermissionValue.FULL,
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

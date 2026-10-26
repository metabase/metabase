import {
  DataPermission,
  type DatabasePermissions,
  DataPermissionValue,
  type Database,
  type Group,
  type GroupId,
  type GroupsPermissions,
  type Impersonation,
  type PermissionsGraph,
} from "metabase-types/api";

export const createMockPermissionsGraph = ({
  groups,
  databases,
  permissionsByGroupId = {},
}: {
  groups: Omit<Group, "members">[];
  databases: Database[];
  /**
   * Per-group overrides merged over the unrestricted defaults, applied to every
   * database. Use it for groups the backend gives narrower access, such as a
   * tenant group that starts out blocked.
   */
  permissionsByGroupId?: Partial<Record<GroupId, Partial<DatabasePermissions>>>;
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
          ...permissionsByGroupId[group.id],
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

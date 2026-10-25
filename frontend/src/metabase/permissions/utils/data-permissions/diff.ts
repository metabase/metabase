import type {
  DatabaseId,
  GroupInfo,
  GroupsPermissions,
  PermissionsDatabase,
} from "metabase-types/api";

import { diffDataPermissions } from "../graph";

type DataPermissionsDiffOpts = {
  groups: GroupInfo[];
  permissions: GroupsPermissions;
  originalPermissions: GroupsPermissions;
  databasesWithTables: Record<DatabaseId, PermissionsDatabase>;
};

export const getDataPermissionsDiff = ({
  groups,
  permissions,
  originalPermissions,
  databasesWithTables,
}: DataPermissionsDiffOpts) =>
  diffDataPermissions(
    permissions,
    originalPermissions,
    groups,
    Object.values(databasesWithTables),
  );

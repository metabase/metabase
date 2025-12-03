import {
  DataPermission,
  DataPermissionValue,
} from "metabase/admin/permissions/types";
import type {
  DatabasePermissions,
  GroupsPermissions,
  Table,
} from "metabase-types/api";

type Options = {
  tables: Table[];
  chosenTables: Table[];
  groupIds: number[];
};

const PERMISSIONS_DENY_ALL: DatabasePermissions = {
  [DataPermission.CREATE_QUERIES]: DataPermissionValue.NO,
  [DataPermission.DOWNLOAD]: { schemas: DataPermissionValue.NONE },
  [DataPermission.VIEW_DATA]: DataPermissionValue.BLOCKED,
};

// Default group and database IDs for a fresh instance.
const ALL_USERS_GROUP_ID = 1;
const SAMPLE_DB_ID = 1;
const CONNECTED_DB_ID = 2;

/**
 * Generates group permissions for defining the permissions graph.
 */
export function getPermissionsForGroups(options: Options): GroupsPermissions {
  const { chosenTables = [], groupIds } = options;

  const groups: GroupsPermissions = {};

  // Block access to everything from the "All Users" group
  groups[ALL_USERS_GROUP_ID] = {
    [SAMPLE_DB_ID]: PERMISSIONS_DENY_ALL,
    [CONNECTED_DB_ID]: PERMISSIONS_DENY_ALL,
  };

  // Define database permissions for each table.
  const getDatabasePermission = <P extends DataPermissionValue>(
    allow: P,
    deny?: P,
  ) => {
    // Tables could be picked from multiple schemas, so we need to group them by schema.
    const schemas: Record<string, Record<string, P>> = {};

    // Deny access to all unselected tables by default
    for (const table of options.tables) {
      if (!schemas[table.schema]) {
        schemas[table.schema] = {};
      }

      if (deny) {
        schemas[table.schema][table.id] = deny;
      }
    }

    // Allow (sandboxed) access to chosen tables
    for (const table of chosenTables) {
      schemas[table.schema][table.id] = allow;
    }

    return schemas;
  };

  for (const groupId of groupIds) {
    if (!groups[groupId]) {
      groups[groupId] = {};
    }

    // Deny access to the sample database for every customer groups
    groups[groupId][SAMPLE_DB_ID] = PERMISSIONS_DENY_ALL;

    // Configure sandboxed access for each groups
    groups[groupId][CONNECTED_DB_ID] = {
      [DataPermission.CREATE_QUERIES]: getDatabasePermission(
        DataPermissionValue.QUERY_BUILDER,
        DataPermissionValue.NO,
      ),

      [DataPermission.DOWNLOAD]: {
        schemas: getDatabasePermission(
          DataPermissionValue.FULL,
          DataPermissionValue.NONE,
        ),
      },

      [DataPermission.VIEW_DATA]: getDatabasePermission(
        DataPermissionValue.SANDBOXED,
        DataPermissionValue.BLOCKED,
      ),
    };
  }

  return groups;
}

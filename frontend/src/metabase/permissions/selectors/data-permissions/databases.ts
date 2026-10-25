import type {
  Database,
  DatabaseId,
  PermissionsDatabase,
} from "metabase-types/api";

const mergeDatabase = (
  listed: Database | undefined,
  withTables: Database | undefined,
): PermissionsDatabase | undefined => {
  if (listed == null) {
    return withTables;
  }
  if (withTables == null) {
    return listed;
  }
  return {
    ...withTables,
    router_user_attribute: listed.router_user_attribute,
  };
};

export const getPermissionsDatabase = (
  listedDatabases: Database[] | undefined,
  databasesWithTables: Record<DatabaseId, PermissionsDatabase>,
  databaseId: DatabaseId | undefined,
): PermissionsDatabase | undefined => {
  if (databaseId == null) {
    return undefined;
  }
  return mergeDatabase(
    listedDatabases?.find(({ id }) => id === databaseId),
    databasesWithTables[databaseId],
  );
};

export const getPermissionsDatabases = (
  listedDatabases: Database[] | undefined,
  databasesWithTables: Record<DatabaseId, PermissionsDatabase>,
): PermissionsDatabase[] =>
  (listedDatabases ?? []).map(
    (database) =>
      mergeDatabase(database, databasesWithTables[database.id]) ?? database,
  );

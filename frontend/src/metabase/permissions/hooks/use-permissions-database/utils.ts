import type { PermissionsDatabase } from "metabase/plugins";
import type { Database, DatabaseId } from "metabase-types/api";

export const getPermissionsDatabase = (
  listedDatabases: Database[] | undefined,
  databaseWithTables: Database | undefined,
  databaseId: DatabaseId | undefined,
): PermissionsDatabase | undefined => {
  if (databaseId == null) {
    return undefined;
  }
  const listed = listedDatabases?.find(({ id }) => id === databaseId);
  if (listed == null || databaseWithTables == null) {
    return databaseWithTables ?? listed;
  }
  return {
    ...databaseWithTables,
    router_user_attribute: listed.router_user_attribute,
  };
};

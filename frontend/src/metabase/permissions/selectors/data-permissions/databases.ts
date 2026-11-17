import { createSelector } from "@reduxjs/toolkit";

import { databaseApi } from "metabase/api";
import type { State } from "metabase/redux/store";
import { checkNotNull } from "metabase/utils/types";
import type {
  Database,
  DatabaseId,
  PermissionsDatabase,
} from "metabase-types/api";

/**
 * The permissions tree needs every table of a database, hidden ones included,
 * and never needs fields. `DataPermissionsPage` subscribes with these exact
 * arguments, so reading the same cache entry back is a hit, not a fetch.
 */
export const DATABASE_TABLES_QUERY = {
  include_hidden: true,
  remove_inactive: true,
  skip_fields: true,
} as const;

export const getDatabaseTablesQuery = (state: State, databaseId: DatabaseId) =>
  databaseApi.endpoints.getDatabaseMetadata.select({
    id: databaseId,
    ...DATABASE_TABLES_QUERY,
  })(state);

// Kept while the page is open, unlike the request's cache entry, which is
// dropped as soon as the admin navigates away from that database.
const getDatabaseWithTables = (state: State, databaseId: DatabaseId) =>
  state.admin.permissions.databasesWithTables[databaseId];

const getListedDatabases = (state: State) =>
  databaseApi.endpoints.listDatabases.select()(state).data?.data;

/**
 * No single endpoint returns everything the permissions tree reads, so it takes
 * each field from the endpoint that has it:
 *
 * - `GET /api/database` is the only one that hydrates `router_user_attribute`,
 *   which the tree shows as "(Database routing enabled)".
 * - `GET /api/database/:id/metadata` is the only one that returns tables, which
 *   the tree walks to find schemas and to check a database's children.
 *
 * Reading only one of them silently drops whatever the other carries.
 */
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
  // Named rather than spread: the metadata response carries no routing
  // attribute, so spreading it over the listed one would blank the field.
  return {
    ...withTables,
    router_user_attribute: listed.router_user_attribute,
  };
};

export const getPermissionsDatabase = (
  state: State,
  databaseId: DatabaseId | undefined,
): PermissionsDatabase | undefined => {
  if (databaseId == null) {
    return undefined;
  }
  return mergeDatabase(
    getListedDatabases(state)?.find(({ id }) => id === databaseId),
    getDatabaseWithTables(state, databaseId),
  );
};

const EMPTY_DATABASES: PermissionsDatabase[] = [];

export const getPermissionsDatabases = createSelector(
  [
    getListedDatabases,
    (state: State) => state.admin.permissions.databasesWithTables,
  ],
  (listed, withTables) =>
    listed == null
      ? EMPTY_DATABASES
      : listed.map((database) =>
          checkNotNull(mergeDatabase(database, withTables[database.id])),
        ),
);

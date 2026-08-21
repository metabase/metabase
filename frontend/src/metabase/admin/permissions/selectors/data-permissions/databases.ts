import { createSelector } from "@reduxjs/toolkit";

import { databaseApi } from "metabase/api";
import type { State } from "metabase/redux/store";
import type { Database, DatabaseId } from "metabase-types/api";

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

export const getPermissionsDatabase = (
  state: State,
  databaseId: DatabaseId | undefined,
): Database | undefined =>
  databaseId == null
    ? undefined
    : getDatabaseTablesQuery(state, databaseId).data;

const EMPTY_DATABASES: Database[] = [];

export const getPermissionsDatabases = createSelector(
  [(state: State) => databaseApi.endpoints.listDatabases.select()(state).data],
  (response) => response?.data ?? EMPTY_DATABASES,
);

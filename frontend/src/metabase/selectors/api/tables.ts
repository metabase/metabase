import { createSelector } from "@reduxjs/toolkit";

import { databaseApi, tableApi } from "metabase/api";
import type { Table } from "metabase-types/api";

import { getApiState, type ApiState } from "./state";
import type { DatabaseEndpointName, TableEndpointName } from "./types";
import { zipEntitySources } from "./utils";

const getDatabaseEntries = (
  state: ApiState,
  endpointName: DatabaseEndpointName,
) => {
  return databaseApi.util
    .selectInvalidatedBy(state, ["table"])
    .filter(entry => entry.endpointName === endpointName);
};

const getTableEntries = (state: ApiState, endpointName: TableEndpointName) => {
  return tableApi.util
    .selectInvalidatedBy(state, ["table"])
    .filter(entry => entry.endpointName === endpointName);
};

const getFromListDatabaseSchemaTables = createSelector(
  getApiState,
  (state): Table[] => {
    return getDatabaseEntries(state, "listDatabaseSchemaTables").flatMap(
      entry => {
        const selector = databaseApi.endpoints.listDatabaseSchemaTables.select(
          entry.originalArgs,
        );
        const { data } = selector(state);
        return data ?? [];
      },
    );
  },
);

const getFromListTables = createSelector(getApiState, (state): Table[] => {
  return getTableEntries(state, "listTables").flatMap(entry => {
    const selector = tableApi.endpoints.listTables.select(entry.originalArgs);
    const { data } = selector(state);
    return data ?? [];
  });
});

const getFromGetTable = createSelector(getApiState, (state): Table[] => {
  return getTableEntries(state, "getTable").flatMap(entry => {
    const selector = tableApi.endpoints.getTable.select(entry.originalArgs);
    const { data } = selector(state);
    return data ? [data] : [];
  });
});

const getFromGetTableQueryMetadata = createSelector(
  getApiState,
  (state): Table[] => {
    return getTableEntries(state, "getTableQueryMetadata").flatMap(entry => {
      const selector = tableApi.endpoints.getTableQueryMetadata.select(
        entry.originalArgs,
      );
      const { data } = selector(state);
      return data ?? [];
    });
  },
);

export const getApiTables = createSelector(
  [
    getFromListDatabaseSchemaTables,
    getFromListTables,
    getFromGetTable,
    getFromGetTableQueryMetadata,
  ],
  zipEntitySources,
);

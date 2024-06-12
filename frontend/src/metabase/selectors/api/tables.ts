import { createSelector } from "@reduxjs/toolkit";

import { tableApi } from "metabase/api";
import type { Table } from "metabase-types/api";

import { getApiState, type ApiState } from "./state";
import { zipSources } from "./utils";

type TableEndpointName = keyof typeof tableApi.endpoints;

const getTableEntries = (state: ApiState, endpointName: TableEndpointName) => {
  return tableApi.util
    .selectInvalidatedBy(state, ["table"])
    .filter(entry => entry.endpointName === endpointName);
};

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
  [getFromGetTable, getFromListTables, getFromGetTableQueryMetadata],
  zipSources,
);

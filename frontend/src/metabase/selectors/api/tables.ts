import { createSelector } from "@reduxjs/toolkit";

import { cardApi, databaseApi, datasetApi, tableApi } from "metabase/api";
import type { Table } from "metabase-types/api";

import { getApiState, type ApiState } from "./state";
import type {
  CardEndpointName,
  DatabaseEndpointName,
  DatasetEndpointName,
  TableEndpointName,
} from "./types";
import { zipEntitySources } from "./utils";

const getDatabaseTableEntries = (
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

const getDatasetTableEntries = (
  state: ApiState,
  endpointName: DatasetEndpointName,
) => {
  return datasetApi.util
    .selectInvalidatedBy(state, ["table"])
    .filter(entry => entry.endpointName === endpointName);
};

const getCardTableEntries = (
  state: ApiState,
  endpointName: CardEndpointName,
) => {
  return cardApi.util
    .selectInvalidatedBy(state, ["table"])
    .filter(entry => entry.endpointName === endpointName);
};

const getFromListDatabaseSchemaTables = createSelector(
  getApiState,
  (state): Table[] => {
    return getDatabaseTableEntries(state, "listDatabaseSchemaTables").flatMap(
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

const getFromGetAdhocQueryMetadata = createSelector(
  getApiState,
  (state): Table[] => {
    return getDatasetTableEntries(state, "getAdhocQueryMetadata").flatMap(
      entry => {
        const selector = datasetApi.endpoints.getAdhocQueryMetadata.select(
          entry.originalArgs,
        );
        const { data } = selector(state);
        return data?.tables ?? [];
      },
    );
  },
);

const getFromGetCardQueryMetadata = createSelector(
  getApiState,
  (state): Table[] => {
    return getCardTableEntries(state, "getCardQueryMetadata").flatMap(entry => {
      const selector = cardApi.endpoints.getCardQueryMetadata.select(
        entry.originalArgs,
      );
      const { data } = selector(state);
      return data?.tables ?? [];
    });
  },
);

export const getApiTables = createSelector(
  [
    getFromListDatabaseSchemaTables,
    getFromListTables,
    getFromGetTable,
    getFromGetTableQueryMetadata,
    getFromGetAdhocQueryMetadata,
    getFromGetCardQueryMetadata,
  ],
  zipEntitySources,
);

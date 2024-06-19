import { createSelector } from "@reduxjs/toolkit";

import {
  automagicDashboardsApi,
  cardApi,
  dashboardApi,
  databaseApi,
  datasetApi,
} from "metabase/api";
import type { Database } from "metabase-types/api";

import { getApiState, type ApiState } from "./state";
import type {
  AutomagicDashboardsEndpointName,
  CardEndpointName,
  DashboardEndpointName,
  DatabaseEndpointName,
  DatasetEndpointName,
} from "./types";
import { zipEntitySources } from "./utils";

const getDatabaseEntries = (
  state: ApiState,
  endpointName: DatabaseEndpointName,
) => {
  return databaseApi.util
    .selectInvalidatedBy(state, ["database"])
    .filter(entry => entry.endpointName === endpointName);
};

const getDatasetDatabaseEntries = (
  state: ApiState,
  endpointName: DatasetEndpointName,
) => {
  return datasetApi.util
    .selectInvalidatedBy(state, ["database"])
    .filter(entry => entry.endpointName === endpointName);
};

const getCardDatabaseEntries = (
  state: ApiState,
  endpointName: CardEndpointName,
) => {
  return cardApi.util
    .selectInvalidatedBy(state, ["database"])
    .filter(entry => entry.endpointName === endpointName);
};

const getAutomagicDashboardDatabaseEntries = (
  state: ApiState,
  endpointName: AutomagicDashboardsEndpointName,
) => {
  return automagicDashboardsApi.util
    .selectInvalidatedBy(state, ["database"])
    .filter(entry => entry.endpointName === endpointName);
};

const getDashboardDatabaseEntries = (
  state: ApiState,
  endpointName: DashboardEndpointName,
) => {
  return dashboardApi.util
    .selectInvalidatedBy(state, ["database"])
    .filter(entry => entry.endpointName === endpointName);
};

const getFromListDatabases = createSelector(
  getApiState,
  (state): Database[] => {
    return getDatabaseEntries(state, "listDatabases").flatMap(entry => {
      const selector = databaseApi.endpoints.listDatabases.select(
        entry.originalArgs,
      );
      const { data } = selector(state);
      return data?.data ?? [];
    });
  },
);

const getFromGetDatabase = createSelector(getApiState, (state): Database[] => {
  return getDatabaseEntries(state, "getDatabase").flatMap(entry => {
    const selector = databaseApi.endpoints.getDatabase.select(
      entry.originalArgs,
    );
    const { data } = selector(state);
    return data ? [data] : [];
  });
});

const getFromGetDatabaseMetadata = createSelector(
  getApiState,
  (state): Database[] => {
    return getDatabaseEntries(state, "getDatabaseMetadata").flatMap(entry => {
      const selector = databaseApi.endpoints.getDatabaseMetadata.select(
        entry.originalArgs,
      );
      const { data } = selector(state);
      return data ? [data] : [];
    });
  },
);

const getFromGetAdhocQueryMetadata = createSelector(
  getApiState,
  (state): Database[] => {
    return getDatasetDatabaseEntries(state, "getAdhocQueryMetadata").flatMap(
      entry => {
        const selector = datasetApi.endpoints.getAdhocQueryMetadata.select(
          entry.originalArgs,
        );
        const { data } = selector(state);
        return data?.databases ?? [];
      },
    );
  },
);

const getFromGetCardQueryMetadata = createSelector(
  getApiState,
  (state): Database[] => {
    return getCardDatabaseEntries(state, "getCardQueryMetadata").flatMap(
      entry => {
        const selector = cardApi.endpoints.getCardQueryMetadata.select(
          entry.originalArgs,
        );
        const { data } = selector(state);
        return data?.databases ?? [];
      },
    );
  },
);

const getFromGetXrayDashboardQueryMetadata = createSelector(
  getApiState,
  (state): Database[] => {
    return getAutomagicDashboardDatabaseEntries(
      state,
      "getXrayDashboardQueryMetadata",
    ).flatMap(entry => {
      const selector =
        automagicDashboardsApi.endpoints.getXrayDashboardQueryMetadata.select(
          entry.originalArgs,
        );
      const { data } = selector(state);
      return data?.databases ?? [];
    });
  },
);

const getFromGetDashboardQueryMetadata = createSelector(
  getApiState,
  (state): Database[] => {
    return getDashboardDatabaseEntries(
      state,
      "getDashboardQueryMetadata",
    ).flatMap(entry => {
      const selector = dashboardApi.endpoints.getDashboardQueryMetadata.select(
        entry.originalArgs,
      );
      const { data } = selector(state);
      return data?.databases ?? [];
    });
  },
);

export const getApiDatabases = createSelector(
  [
    getFromGetDatabase,
    getFromGetDatabaseMetadata,
    getFromGetAdhocQueryMetadata,
    getFromGetCardQueryMetadata,
    getFromGetXrayDashboardQueryMetadata,
    getFromGetDashboardQueryMetadata,
    getFromListDatabases,
  ],
  zipEntitySources,
);

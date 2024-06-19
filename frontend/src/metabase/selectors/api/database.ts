import { createSelector } from "@reduxjs/toolkit";

import {
  automagicDashboardsApi,
  cardApi,
  dashboardApi,
  databaseApi,
  datasetApi,
} from "metabase/api";

import { getApiState, type ApiState } from "./state";
import type {
  AutomagicDashboardsEndpointName,
  CardEndpointName,
  DashboardEndpointName,
  DatabaseEndpointName,
  DatabaseEntries,
  DatasetEndpointName,
} from "./types";
import { zip } from "./utils";

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
  (state): DatabaseEntries[] => {
    return getDatabaseEntries(state, "listDatabases").flatMap(entry => {
      const selector = databaseApi.endpoints.listDatabases.select(
        entry.originalArgs,
      );
      const { data, fulfilledTimeStamp } = selector(state);

      return {
        entities: data?.data ?? [],
        fulfilledTimeStamp,
      };
    });
  },
);

const getFromGetDatabase = createSelector(
  getApiState,
  (state): DatabaseEntries[] => {
    return getDatabaseEntries(state, "getDatabase").flatMap(entry => {
      const selector = databaseApi.endpoints.getDatabase.select(
        entry.originalArgs,
      );
      const { data, fulfilledTimeStamp } = selector(state);

      return {
        entities: data ? [data] : [],
        fulfilledTimeStamp,
      };
    });
  },
);

const getFromGetDatabaseMetadata = createSelector(
  getApiState,
  (state): DatabaseEntries[] => {
    return getDatabaseEntries(state, "getDatabaseMetadata").flatMap(entry => {
      const selector = databaseApi.endpoints.getDatabaseMetadata.select(
        entry.originalArgs,
      );
      const { data, fulfilledTimeStamp } = selector(state);

      return {
        entities: data ? [data] : [],
        fulfilledTimeStamp,
      };
    });
  },
);

const getFromGetAdhocQueryMetadata = createSelector(
  getApiState,
  (state): DatabaseEntries[] => {
    return getDatasetDatabaseEntries(state, "getAdhocQueryMetadata").flatMap(
      entry => {
        const selector = datasetApi.endpoints.getAdhocQueryMetadata.select(
          entry.originalArgs,
        );
        const { data, fulfilledTimeStamp } = selector(state);

        return {
          entities: data?.databases ?? [],
          fulfilledTimeStamp,
        };
      },
    );
  },
);

const getFromGetCardQueryMetadata = createSelector(
  getApiState,
  (state): DatabaseEntries[] => {
    return getCardDatabaseEntries(state, "getCardQueryMetadata").flatMap(
      entry => {
        const selector = cardApi.endpoints.getCardQueryMetadata.select(
          entry.originalArgs,
        );
        const { data, fulfilledTimeStamp } = selector(state);

        return {
          entities: data?.databases ?? [],
          fulfilledTimeStamp,
        };
      },
    );
  },
);

const getFromGetXrayDashboardQueryMetadata = createSelector(
  getApiState,
  (state): DatabaseEntries[] => {
    return getAutomagicDashboardDatabaseEntries(
      state,
      "getXrayDashboardQueryMetadata",
    ).flatMap(entry => {
      const selector =
        automagicDashboardsApi.endpoints.getXrayDashboardQueryMetadata.select(
          entry.originalArgs,
        );
      const { data, fulfilledTimeStamp } = selector(state);

      return {
        entities: data?.databases ?? [],
        fulfilledTimeStamp,
      };
    });
  },
);

const getFromGetDashboardQueryMetadata = createSelector(
  getApiState,
  (state): DatabaseEntries[] => {
    return getDashboardDatabaseEntries(
      state,
      "getDashboardQueryMetadata",
    ).flatMap(entry => {
      const selector = dashboardApi.endpoints.getDashboardQueryMetadata.select(
        entry.originalArgs,
      );
      const { data, fulfilledTimeStamp } = selector(state);

      return {
        entities: data?.databases ?? [],
        fulfilledTimeStamp,
      };
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
  zip,
);

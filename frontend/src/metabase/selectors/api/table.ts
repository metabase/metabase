import { createSelector } from "@reduxjs/toolkit";

import {
  automagicDashboardsApi,
  cardApi,
  dashboardApi,
  databaseApi,
  datasetApi,
  segmentApi,
  tableApi,
} from "metabase/api";
import type { Table } from "metabase-types/api";

import { getApiState, type ApiState } from "./state";
import type {
  AutomagicDashboardsEndpointName,
  CardEndpointName,
  DashboardEndpointName,
  DatabaseEndpointName,
  DatasetEndpointName,
  SegmentEndpointName,
  TableEndpointName,
  TableEntries,
} from "./types";
import { zip } from "./utils";

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

const getAutomagicDashboardTableEntries = (
  state: ApiState,
  endpointName: AutomagicDashboardsEndpointName,
) => {
  return automagicDashboardsApi.util
    .selectInvalidatedBy(state, ["table"])
    .filter(entry => entry.endpointName === endpointName);
};

const getDashboardTableEntries = (
  state: ApiState,
  endpointName: DashboardEndpointName,
) => {
  return dashboardApi.util
    .selectInvalidatedBy(state, ["table"])
    .filter(entry => entry.endpointName === endpointName);
};

const getSegmentTableEntries = (
  state: ApiState,
  endpointName: SegmentEndpointName,
) => {
  return segmentApi.util
    .selectInvalidatedBy(state, ["table"])
    .filter(entry => entry.endpointName === endpointName);
};

const getFromListDatabaseSchemaTables = createSelector(
  getApiState,
  (state): TableEntries[] => {
    return getDatabaseTableEntries(state, "listDatabaseSchemaTables").flatMap(
      entry => {
        const selector = databaseApi.endpoints.listDatabaseSchemaTables.select(
          entry.originalArgs,
        );
        const { data, fulfilledTimeStamp } = selector(state);

        return {
          entities: data ?? [],
          fulfilledTimeStamp,
        };
      },
    );
  },
);

const getFromListTables = createSelector(
  getApiState,
  (state): TableEntries[] => {
    return getTableEntries(state, "listTables").flatMap(entry => {
      const selector = tableApi.endpoints.listTables.select(entry.originalArgs);
      const { data, fulfilledTimeStamp } = selector(state);

      return {
        entities: data ?? [],
        fulfilledTimeStamp,
      };
    });
  },
);

const getFromGetTable = createSelector(getApiState, (state): TableEntries[] => {
  return getTableEntries(state, "getTable").flatMap(entry => {
    const selector = tableApi.endpoints.getTable.select(entry.originalArgs);
    const { data, fulfilledTimeStamp } = selector(state);

    return {
      entities: data ? [data] : [],
      fulfilledTimeStamp,
    };
  });
});

const getFromGetTableQueryMetadata = createSelector(
  getApiState,
  (state): TableEntries[] => {
    return getTableEntries(state, "getTableQueryMetadata").flatMap(entry => {
      const selector = tableApi.endpoints.getTableQueryMetadata.select(
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
  (state): TableEntries[] => {
    return getDatasetTableEntries(state, "getAdhocQueryMetadata").flatMap(
      entry => {
        const selector = datasetApi.endpoints.getAdhocQueryMetadata.select(
          entry.originalArgs,
        );
        const { data, fulfilledTimeStamp } = selector(state);

        return {
          entities: data?.tables ?? [],
          fulfilledTimeStamp,
        };
      },
    );
  },
);

const getFromGetCardQueryMetadata = createSelector(
  getApiState,
  (state): TableEntries[] => {
    return getCardTableEntries(state, "getCardQueryMetadata").flatMap(entry => {
      const selector = cardApi.endpoints.getCardQueryMetadata.select(
        entry.originalArgs,
      );
      const { data, fulfilledTimeStamp } = selector(state);

      return {
        entities: data?.tables ?? [],
        fulfilledTimeStamp,
      };
    });
  },
);

const getFromGetXrayDashboardQueryMetadata = createSelector(
  getApiState,
  (state): TableEntries[] => {
    return getAutomagicDashboardTableEntries(
      state,
      "getXrayDashboardQueryMetadata",
    ).flatMap(entry => {
      const selector =
        automagicDashboardsApi.endpoints.getXrayDashboardQueryMetadata.select(
          entry.originalArgs,
        );
      const { data, fulfilledTimeStamp } = selector(state);

      return {
        entities: data?.tables ?? [],
        fulfilledTimeStamp,
      };
    });
  },
);

const getFromGetDashboardQueryMetadata = createSelector(
  getApiState,
  (state): TableEntries[] => {
    return getDashboardTableEntries(state, "getDashboardQueryMetadata").flatMap(
      entry => {
        const selector =
          dashboardApi.endpoints.getDashboardQueryMetadata.select(
            entry.originalArgs,
          );
        const { data, fulfilledTimeStamp } = selector(state);

        return {
          entities: data?.tables ?? [],
          fulfilledTimeStamp,
        };
      },
    );
  },
);

const getFromListSegments = createSelector(
  getApiState,
  (state): TableEntries[] => {
    return getSegmentTableEntries(state, "listSegments").flatMap(entry => {
      const selector = segmentApi.endpoints.listSegments.select(
        entry.originalArgs,
      );
      const { data, fulfilledTimeStamp } = selector(state);

      return {
        entities: data
          ? data
              .map(segment => segment.table)
              .filter((table): table is Table => table != null)
          : [],
        fulfilledTimeStamp,
      };
    });
  },
);

const getFromGetSegment = createSelector(
  getApiState,
  (state): TableEntries[] => {
    return getSegmentTableEntries(state, "getSegment").flatMap(entry => {
      const selector = segmentApi.endpoints.getSegment.select(
        entry.originalArgs,
      );
      const { data, fulfilledTimeStamp } = selector(state);

      return {
        entities: data?.table ? [data.table] : [],
        fulfilledTimeStamp,
      };
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
    getFromGetXrayDashboardQueryMetadata,
    getFromGetDashboardQueryMetadata,
    getFromListSegments, // TODO: remove cross-reference once RTK segments are mapped in this directory as well
    getFromGetSegment, // TODO: remove cross-reference once RTK segments are mapped in this directory as well
  ],
  zip,
);

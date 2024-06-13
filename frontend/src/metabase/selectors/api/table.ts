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

const getFromGetDatabase = createSelector(getApiState, (state): Table[] => {
  return getDatabaseTableEntries(state, "getDatabase").flatMap(entry => {
    const selector = databaseApi.endpoints.getDatabase.select(
      entry.originalArgs,
    );
    const { data } = selector(state);
    return data?.tables ?? [];
  });
});

const getFromGetDatabaseMetadata = createSelector(
  getApiState,
  (state): Table[] => {
    return getDatabaseTableEntries(state, "getDatabaseMetadata").flatMap(
      entry => {
        const selector = databaseApi.endpoints.getDatabaseMetadata.select(
          entry.originalArgs,
        );
        const { data } = selector(state);
        return data?.tables ?? [];
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

const getFromGetXrayDashboardQueryMetadata = createSelector(
  getApiState,
  (state): Table[] => {
    return getAutomagicDashboardTableEntries(
      state,
      "getXrayDashboardQueryMetadata",
    ).flatMap(entry => {
      const selector =
        automagicDashboardsApi.endpoints.getXrayDashboardQueryMetadata.select(
          entry.originalArgs,
        );
      const { data } = selector(state);
      return data?.tables ?? [];
    });
  },
);

const getFromGetDashboardQueryMetadata = createSelector(
  getApiState,
  (state): Table[] => {
    return getDashboardTableEntries(state, "getDashboardQueryMetadata").flatMap(
      entry => {
        const selector =
          dashboardApi.endpoints.getDashboardQueryMetadata.select(
            entry.originalArgs,
          );
        const { data } = selector(state);
        return data?.tables ?? [];
      },
    );
  },
);

const getFromListSegments = createSelector(getApiState, (state): Table[] => {
  return getSegmentTableEntries(state, "listSegments").flatMap(entry => {
    const selector = segmentApi.endpoints.listSegments.select(
      entry.originalArgs,
    );
    const { data } = selector(state);
    return data
      ? data
          .map(segment => segment.table)
          .filter((table): table is Table => table != null)
      : [];
  });
});

const getFromGetSegment = createSelector(getApiState, (state): Table[] => {
  return getSegmentTableEntries(state, "getSegment").flatMap(entry => {
    const selector = segmentApi.endpoints.getSegment.select(entry.originalArgs);
    const { data } = selector(state);
    return data?.table ? [data.table] : [];
  });
});

export const getApiTables = createSelector(
  [
    getFromListDatabaseSchemaTables,
    getFromGetDatabase,
    getFromGetDatabaseMetadata,
    getFromListTables,
    getFromGetTable,
    getFromGetTableQueryMetadata,
    getFromGetAdhocQueryMetadata,
    getFromGetCardQueryMetadata,
    getFromGetXrayDashboardQueryMetadata,
    getFromGetDashboardQueryMetadata,
    getFromListSegments,
    getFromGetSegment,
  ],
  zipEntitySources,
);

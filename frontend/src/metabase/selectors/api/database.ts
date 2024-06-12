import { createSelector } from "@reduxjs/toolkit";

import { databaseApi } from "metabase/api";
import type { Database } from "metabase-types/api";

import { getApiState, type ApiState } from "./state";
import type { DatabaseEndpointName } from "./types";
import { zipEntitySources } from "./utils";

const getDatabaseEntries = (
  state: ApiState,
  endpointName: DatabaseEndpointName,
) => {
  return databaseApi.util
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

export const getApiDatabases = createSelector(
  [getFromListDatabases],
  zipEntitySources,
);

import { QueryStatus } from "@reduxjs/toolkit/query";

import type { State } from "metabase/redux/store";
import {
  createMockApiState,
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import type { MetadataSelectorOpts } from "metabase/selectors/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import type { Measure, Settings } from "metabase-types/api";

import type { EntitiesStateOpts } from "./store";
import { createMockEntitiesState } from "./store";

export function createMockMetadata(
  entities: EntitiesStateOpts = {},
  settings?: Settings,
  metadataOpts?: MetadataSelectorOpts,
) {
  const state = createMockState({
    entities: createMockEntitiesState(entities),
    "metabase-api": createMockApiStateWithMeasures(entities.measures ?? []),
    settings: createMockSettingsState(settings),
  });

  return getMetadata(state, metadataOpts);
}

function createMockApiStateWithMeasures(
  measures: Measure[],
): State["metabase-api"] {
  const apiState = createMockApiState();
  if (measures.length === 0) {
    return apiState;
  }
  const timestamp = Date.now();
  return {
    ...apiState,
    queries: {
      ...apiState.queries,
      "listMeasures(undefined)": {
        status: QueryStatus.fulfilled,
        data: measures,
        error: undefined,
        originalArgs: undefined,
        requestId: "mock-list-measures",
        endpointName: "listMeasures",
        startedTimeStamp: timestamp,
        fulfilledTimeStamp: timestamp,
      },
    },
  };
}

import fetchMock from "fetch-mock";

import { getMainStore } from "__support__/entities-store";
import {
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { getMetadata } from "metabase/metadata-store";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase/redux/store/mocks";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type { VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { apiUpdateQuestion } from "./core";

registerVisualizations();

const METRIC_SETTINGS: VisualizationSettings = {
  "graph.dimensions": ["CREATED_AT"],
  "graph.metrics": ["count"],
};

const METRIC = createMockCard({
  id: 1,
  type: "metric",
  display: "line",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, null]],
    },
  },
  visualization_settings: METRIC_SETTINGS,
});

const EVENT_SELECTION: VisualizationSettings = {
  "timeline.selected_timeline_ids": [10],
  "timeline.excluded_timeline_event_ids": [100],
};

const setup = () => {
  setupCardEndpoints(METRIC);
  setupCardQueryMetadataEndpoint(
    METRIC,
    createMockCardQueryMetadata({ databases: [createSampleDatabase()] }),
  );
  const entities = createMockEntitiesState({
    databases: [createSampleDatabase()],
    questions: [METRIC],
  });
  const store = getMainStore(
    createMockState({
      entities,
      qb: createMockQueryBuilderState({ card: METRIC, originalCard: METRIC }),
    }),
  );
  const question = checkNotNull(getMetadata(store.getState()).question(1));
  return { store, question };
};

const getSavedSettings = () => {
  const call = fetchMock.callHistory.lastCall("path:/api/card/1", {
    method: "PUT",
  });
  return JSON.parse(String(call?.options.body)).visualization_settings;
};

describe("apiUpdateQuestion", () => {
  it("saves a metric's event selection without touching its other settings", async () => {
    const { store, question } = setup();

    await store.dispatch(
      apiUpdateQuestion(
        question.setSettings({
          ...METRIC_SETTINGS,
          "graph.show_values": true,
          ...EVENT_SELECTION,
        }),
        { rerunQuery: false },
      ),
    );

    expect(getSavedSettings()).toEqual({
      ...METRIC_SETTINGS,
      ...EVENT_SELECTION,
    });
  });
});

import { getMainStore } from "__support__/entities-store";
import {
  setupCardCreateEndpoint,
  setupCardDataset,
  setupCardQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { waitFor } from "__support__/ui";
import { getMetadata } from "metabase/metadata-store";
import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { registerVisualizations } from "metabase/visualizations/register";
import Question from "metabase-lib/v1/Question";
import type {
  CardDisplayType,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockColumn,
  createMockDataset,
} from "metabase-types/api/mocks";
import {
  createAdHocCard,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { apiCreateQuestion } from "./core";

registerVisualizations();

// `setupCardCreateEndpoint` responds with `createMockCard`, whose default id this is
const CREATED_CARD_ID = 1;

const ORDERS_COLUMNS = (createOrdersTable().fields ?? []).map((field) =>
  createMockColumn({
    ...field,
    id: Number(field.id),
    source: "fields",
    field_ref: ["field", Number(field.id), null],
  }),
);

type SetupOpts = {
  display: CardDisplayType;
  visualizationSettings: VisualizationSettings;
};

async function setup({ display, visualizationSettings }: SetupOpts) {
  const database = createSampleDatabase();
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [database] }),
  });
  const newModel = new Question(
    {
      ...createAdHocCard({
        display,
        visualization_settings: visualizationSettings,
      }),
      type: "model",
      name: "Orders model",
    },
    getMetadata(state),
  );
  const store = getMainStore({
    ...state,
    qb: createMockQueryBuilderState({
      card: newModel.card(),
      lastRunCard: newModel.card(),
      queryResults: [createMockDataset({ data: { cols: ORDERS_COLUMNS } })],
      uiControls: createMockQueryBuilderUIControlsState({
        queryBuilderMode: "dataset",
      }),
    }),
  });

  setupCardCreateEndpoint();
  setupCardQueryMetadataEndpoint(
    createMockCard({ id: CREATED_CARD_ID }),
    createMockCardQueryMetadata({ databases: [database] }),
  );
  setupCardDataset({ dataset: { data: { cols: ORDERS_COLUMNS } } });

  await apiCreateQuestion(newModel)(store.dispatch, store.getState);

  // the created model's query is run in the background
  await waitFor(() => {
    expect(store.getState().qb.queryStatus).toBe("complete");
  });

  return { store };
}

describe("QB Actions > apiCreateQuestion", () => {
  it.each<SetupOpts>([
    {
      display: "list",
      visualizationSettings: {
        "list.columns": { left: ["ID"], right: ["QUANTITY"] },
        "list.entity_icon_enabled": false,
      },
    },
    {
      display: "table",
      visualizationSettings: {
        column_settings: { '["name","QUANTITY"]': { column_title: "Qty" } },
      },
    },
  ])(
    "should keep the display and visualization settings of a new $display model once its query completes (metabase#76998)",
    async ({ display, visualizationSettings }) => {
      const { store } = await setup({ display, visualizationSettings });

      const { card, originalCard } = store.getState().qb;
      expect(card?.id).toBe(CREATED_CARD_ID);
      expect(card?.display).toBe(display);
      // the settings the model was created with, including persisted defaults
      expect(card?.visualization_settings).toEqual(
        originalCard?.visualization_settings,
      );
      expect(card?.visualization_settings).toEqual(
        expect.objectContaining(visualizationSettings),
      );
    },
  );
});

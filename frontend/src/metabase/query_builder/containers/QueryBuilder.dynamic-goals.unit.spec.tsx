import fetchMock from "fetch-mock";

import { act, screen, waitFor } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import type { Database } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockReferencedEntitiesResults,
  createMockStructuredDatasetQuery,
  createMockStructuredQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { onUpdateVisualizationSettings } from "../actions";

import { setup as setupQueryBuilder } from "./test-utils";

registerVisualizations();

beforeAll(() => loadVisualizationComponents(["progress"]));

const CARD = createMockCard({
  display: "progress",
  dataset_query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: createMockStructuredQuery({
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
    }),
  }),
  visualization_settings: {
    "progress.goal": { type: "card", id: 9, column: "goal" },
  },
});

const COUNT_DATA = {
  cols: [createMockColumn({ name: "count", base_type: "type/Integer" })],
  rows: [[50]],
};

const CARD_DATASET = createMockDataset({
  data: {
    ...COUNT_DATA,
    referenced_entities: createMockReferencedEntitiesResults({
      id: 9,
      value: 250,
    }),
  },
});

const NEW_GOAL_SOURCE_DATASET = createMockDataset({
  data: {
    ...COUNT_DATA,
    referenced_entities: createMockReferencedEntitiesResults({
      id: 10,
      value: 300,
    }),
  },
});

type SetupOpts = {
  database: Database;
};

async function setup({ database }: SetupOpts) {
  const { store } = await setupQueryBuilder({
    card: CARD,
    database,
    dataset: CARD_DATASET,
  });
  fetchMock.modifyRoute("dataset-post", {
    response: NEW_GOAL_SOURCE_DATASET,
  });
  await screen.findByText("Goal 250");

  async function pickNewGoalSource() {
    await act(() =>
      store.dispatch(
        onUpdateVisualizationSettings({
          "progress.goal": { type: "card", id: 10, column: "goal" },
        }),
      ),
    );
  }

  return { pickNewGoalSource };
}

describe("QueryBuilder > dynamic goals", () => {
  describe("saved question when a new goal source is picked", () => {
    it("runs the question as an ad-hoc query instead of the card query, next to the goal source query", async () => {
      const { pickNewGoalSource } = await setup({
        database: createSampleDatabase({ auto_run_queries: true }),
      });
      expect(getCardQueryCalls()).toHaveLength(1);
      expect(getDatasetCalls()).toHaveLength(0);

      await pickNewGoalSource();

      expect(await screen.findByText("Goal 300")).toBeInTheDocument();
      await waitFor(() => expect(getDatasetCalls()).toHaveLength(2));
      expect(await getDatasetBodies()).toEqual(
        expect.arrayContaining([
          // the re-run of the question, which turned ad-hoc with the settings change
          expect.objectContaining({
            parameters: [],
            referenced_entities: [{ type: "card", id: 10, columns: ["goal"] }],
          }),
          // the goal source query, for the result that is still on screen
          expect.objectContaining({
            referenced_entities: [{ type: "card", id: 10 }],
          }),
        ]),
      );
      expect(getCardQueryCalls()).toHaveLength(1);
    });

    it("answers the new goal source with only the goal source query when the database does not auto-run queries", async () => {
      const { pickNewGoalSource } = await setup({
        database: createSampleDatabase({ auto_run_queries: false }),
      });

      await pickNewGoalSource();

      expect(await screen.findByText("Goal 300")).toBeInTheDocument();
      expect(await getDatasetBodies()).toEqual([
        expect.objectContaining({
          referenced_entities: [{ type: "card", id: 10 }],
        }),
      ]);
      expect(getCardQueryCalls()).toHaveLength(1);
    });
  });
});

function getCardQueryCalls() {
  return fetchMock.callHistory.calls(`path:/api/card/${CARD.id}/query`);
}

function getDatasetCalls() {
  return fetchMock.callHistory.calls("path:/api/dataset");
}

function getDatasetBodies(): Promise<unknown[]> {
  return Promise.all(
    getDatasetCalls().map((call) => checkNotNull(call.request).json()),
  );
}

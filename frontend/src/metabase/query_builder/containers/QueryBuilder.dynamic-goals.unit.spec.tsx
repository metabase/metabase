import fetchMock from "fetch-mock";

import { setupGoalValuesEndpoint } from "__support__/server-mocks";
import { act, screen } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Database } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockReferencedEntitiesResults,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { onUpdateVisualizationSettings } from "../actions";

import { setup as setupQueryBuilder } from "./test-utils";

registerVisualizations();

beforeAll(() => loadVisualizationComponents(["progress"]));

const CARD = createMockCard({
  display: "progress",
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
      },
    ],
  }),
  visualization_settings: {
    "progress.goal": { type: "card", id: 9, column: "goal" },
  },
});

const COUNT_DATA = {
  cols: [createMockColumn({ name: "count", base_type: "type/Integer" })],
  rows: [[50]],
};

const CARD_DATASET = createMockDataset({ data: COUNT_DATA });

const CARD_9_GOAL_VALUES = createMockReferencedEntitiesResults({
  id: 9,
  value: 250,
});

const CARD_10_GOAL_VALUES = createMockReferencedEntitiesResults({
  id: 10,
  value: 300,
});

type SetupOpts = {
  database: Database;
};

async function setup({ database }: SetupOpts) {
  setupGoalValuesEndpoint(async (call) => {
    const body = await call.request?.clone().text();
    return body?.includes(`"id":10`) ? CARD_10_GOAL_VALUES : CARD_9_GOAL_VALUES;
  });
  const { store } = await setupQueryBuilder({
    card: CARD,
    database,
    dataset: CARD_DATASET,
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
  it("fetches the goal values of a saved question next to its card query", async () => {
    await setup({ database: createSampleDatabase() });

    expect(getCardQueryCalls()).toHaveLength(1);
    expect(await getGoalValuesBodies()).toEqual([
      { sources: [{ type: "card", id: 9, columns: ["goal"] }] },
    ]);
  });

  it("answers a newly picked goal source with only its goal values, without running the question again", async () => {
    const { pickNewGoalSource } = await setup({
      database: createSampleDatabase({ auto_run_queries: true }),
    });

    await pickNewGoalSource();

    expect(await screen.findByText("Goal 300")).toBeInTheDocument();
    expect(await getGoalValuesBodies()).toEqual([
      { sources: [{ type: "card", id: 9, columns: ["goal"] }] },
      { sources: [{ type: "card", id: 10 }] },
    ]);
    expect(getCardQueryCalls()).toHaveLength(1);
    expect(getDatasetCalls()).toHaveLength(0);
  });
});

function getCardQueryCalls() {
  return fetchMock.callHistory.calls(`path:/api/card/${CARD.id}/query`);
}

function getDatasetCalls() {
  return fetchMock.callHistory.calls("path:/api/dataset");
}

function getGoalValuesBodies(): Promise<unknown[]> {
  return getRequestBodies("path:/api/dynamic-goal/values");
}

function getRequestBodies(path: string): Promise<unknown[]> {
  return Promise.all(
    fetchMock.callHistory
      .calls(path)
      .map((call) => checkNotNull(call.request).json()),
  );
}

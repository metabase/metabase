import fetchMock from "fetch-mock";

import { setupGoalSourceResultsEndpoint } from "__support__/server-mocks";
import { act, screen } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Database } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockGoalSourceResults,
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

type SetupOpts = {
  database: Database;
};

async function setup({ database }: SetupOpts) {
  setupGoalSourceResultsEndpoint((call) => {
    const { body } = call.options;
    const isNewSource = typeof body === "string" && body.includes('"id":10');

    return createMockGoalSourceResults({
      id: isNewSource ? 10 : 9,
      value: isNewSource ? 300 : 250,
    });
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
  it("fetches the goal source results once, next to the question query", async () => {
    await setup({ database: createSampleDatabase() });

    expect(getCardQueryCalls()).toHaveLength(1);
    expect(await getGoalSourceBodies()).toEqual([
      { sources: [{ type: "card", id: 9 }] },
    ]);
  });

  it("fetches the results of a new goal source without running the question again", async () => {
    const { pickNewGoalSource } = await setup({
      database: createSampleDatabase({ auto_run_queries: true }),
    });

    await pickNewGoalSource();

    expect(await screen.findByText("Goal 300")).toBeInTheDocument();
    expect(await getGoalSourceBodies()).toEqual([
      { sources: [{ type: "card", id: 9 }] },
      { sources: [{ type: "card", id: 10 }] },
    ]);
    expect(getCardQueryCalls()).toHaveLength(1);
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });
});

function getCardQueryCalls() {
  return fetchMock.callHistory.calls(`path:/api/card/${CARD.id}/query`);
}

function getGoalSourceBodies(): Promise<unknown[]> {
  return Promise.all(
    fetchMock.callHistory
      .calls("path:/api/dynamic-goal/values")
      .map((call): Promise<unknown> => {
        return call.request?.json() ?? Promise.resolve(undefined);
      }),
  );
}

import fetchMock from "fetch-mock";

import { setupGoalValuesEndpoint } from "__support__/server-mocks";
import { act, screen, waitFor } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { ReferencedEntitiesResults } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockReferencedEntityResult,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { onUpdateVisualizationSettings, runQuestionQuery } from "../actions";

import { setup as setupQueryBuilder } from "./test-utils";

registerVisualizations();

beforeAll(() => loadVisualizationComponents(["progress"]));

const GOAL_SOURCE_ID = 9;
const NEW_GOAL_SOURCE_ID = 10;

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
    "progress.goal": { type: "card", id: GOAL_SOURCE_ID, column: "goal" },
  },
});

const CARD_DATASET = createMockDataset({
  data: {
    cols: [createMockColumn({ name: "count", base_type: "type/Integer" })],
    rows: [[50]],
  },
});

async function setup() {
  setupGoalValuesEndpoint(createGoalValues({ goal: 250, newGoal: 300 }));
  const { store } = await setupQueryBuilder({
    card: CARD,
    database: createSampleDatabase({ auto_run_queries: true }),
    dataset: CARD_DATASET,
  });
  await screen.findByText("Goal 250");

  async function pickNewGoalSource() {
    await act(() =>
      store.dispatch(
        onUpdateVisualizationSettings({
          "progress.goal": {
            type: "card",
            id: NEW_GOAL_SOURCE_ID,
            column: "goal",
          },
        }),
      ),
    );
  }

  async function runQuestionAgain() {
    await act(() => store.dispatch(runQuestionQuery()));
  }

  return { pickNewGoalSource, runQuestionAgain };
}

describe("QueryBuilder > dynamic goals", () => {
  it("fetches the value of a newly picked goal source without running the question again", async () => {
    const { pickNewGoalSource } = await setup();
    expect(getGoalValuesCalls()).toHaveLength(1);

    await pickNewGoalSource();

    expect(await screen.findByText("Goal 300")).toBeInTheDocument();
    expect(await getGoalValuesBodies()).toEqual([
      { sources: [{ type: "card", id: GOAL_SOURCE_ID }] },
      { sources: [{ type: "card", id: NEW_GOAL_SOURCE_ID }] },
    ]);
    expect(getCardQueryCalls()).toHaveLength(1);
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("fetches the goal values again when the question runs again", async () => {
    const { runQuestionAgain } = await setup();
    fetchMock.modifyRoute("dynamic-goal-values", {
      response: createGoalValues({ goal: 275, newGoal: 300 }),
    });

    await runQuestionAgain();

    expect(await screen.findByText("Goal 275")).toBeInTheDocument();
    await waitFor(() => expect(getCardQueryCalls()).toHaveLength(2));
    expect(getGoalValuesCalls()).toHaveLength(2);
  });
});

function createGoalValues({
  goal,
  newGoal,
}: {
  goal: number;
  newGoal: number;
}): ReferencedEntitiesResults {
  return {
    card: {
      [GOAL_SOURCE_ID]: createMockReferencedEntityResult({ value: goal }),
      [NEW_GOAL_SOURCE_ID]: createMockReferencedEntityResult({
        value: newGoal,
      }),
    },
  };
}

function getCardQueryCalls() {
  return fetchMock.callHistory.calls(`path:/api/card/${CARD.id}/query`);
}

function getGoalValuesCalls() {
  return fetchMock.callHistory.calls("path:/api/dynamic-goal/values");
}

function getGoalValuesBodies(): Promise<unknown[]> {
  return Promise.all(
    getGoalValuesCalls().map((call) => checkNotNull(call.request).json()),
  );
}

import { createMockMetadata } from "__support__/metadata";
import {
  createMockQueryBuilderState,
  createMockState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { Card, Dataset } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { QUERY_COMPLETED } from "../store/actions";

import { queryCompleted } from "./querying";

const DATABASE = createSampleDatabase();

const CARD = createMockCard({
  display: "table",
  query_type: "native",
  dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
    query: "select 1 as visible, 2 as hidden",
  }),
  visualization_settings: {
    "table.columns": [
      { name: "VISIBLE", enabled: true },
      { name: "HIDDEN", enabled: false },
    ],
  },
});

const getDataset = (columnNames: string[]) =>
  createMockDataset({
    data: createMockDatasetData({
      cols: columnNames.map((name) =>
        createMockColumn({ name, display_name: name, source: "native" }),
      ),
      rows: [columnNames.map((_, index) => index)],
    }),
  });

const ERROR_DATASET = createMockDataset({
  error: 'Column "FOO" not found',
  data: createMockDatasetData({ cols: [], rows: [] }),
});

interface SetupOpts {
  previousResult: Dataset;
  newResult: Dataset;
}

async function setup({ previousResult, newResult }: SetupOpts) {
  const metadata = createMockMetadata({ databases: [DATABASE] });
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [DATABASE] }),
    qb: createMockQueryBuilderState({
      card: CARD,
      queryResults: [previousResult],
    }),
  });
  const dispatch = jest.fn<unknown, [unknown]>();

  await queryCompleted(new Question(CARD, metadata), [newResult])(
    dispatch,
    () => state,
  );

  const completedAction = checkNotNull(
    dispatch.mock.calls.map(([action]) => action).find(isQueryCompletedAction),
  );

  return { completedCard: completedAction.payload.card };
}

type QueryCompletedAction = {
  type: typeof QUERY_COMPLETED;
  payload: { card: Card };
};

function isQueryCompletedAction(
  action: unknown,
): action is QueryCompletedAction {
  return (
    typeof action === "object" &&
    action !== null &&
    "type" in action &&
    action.type === QUERY_COMPLETED
  );
}

describe("queryCompleted", () => {
  it("keeps hidden native columns hidden and shows new ones (metabase#15393)", async () => {
    const { completedCard } = await setup({
      previousResult: getDataset(["VISIBLE", "HIDDEN"]),
      newResult: getDataset(["VISIBLE", "HIDDEN", "ADDED"]),
    });

    expect(completedCard.visualization_settings["table.columns"]).toEqual([
      { name: "VISIBLE", enabled: true },
      { name: "HIDDEN", enabled: false },
      { name: "ADDED", enabled: true },
    ]);
  });

  it("keeps the column settings when the query fails (metabase#16914)", async () => {
    const { completedCard } = await setup({
      previousResult: getDataset(["VISIBLE", "HIDDEN"]),
      newResult: ERROR_DATASET,
    });

    expect(completedCard.visualization_settings["table.columns"]).toEqual([
      { name: "VISIBLE", enabled: true },
      { name: "HIDDEN", enabled: false },
    ]);
  });
});

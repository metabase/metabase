import { createMockMetadata } from "__support__/metadata";
import { syncVizSettingsWithQuery } from "metabase/querying/viz-settings/utils/sync-viz-settings";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { TestBreakoutSpec } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getSummaryQuestion } from "./pivot-question";

const STAGE_INDEX = -1;

const ORDERS_CREATED_AT: TestBreakoutSpec = {
  type: "column",
  name: "CREATED_AT",
  unit: "month",
};

const PRODUCTS_CREATED_AT: TestBreakoutSpec = {
  type: "column",
  sourceFieldId: ORDERS.PRODUCT_ID,
  name: "CREATED_AT",
  unit: "month",
};

function createQuestion(card: Parameters<typeof createMockCard>[0] = {}) {
  const metadata = createMockMetadata({ databases: [createSampleDatabase()] });
  return new Question(
    createMockCard({
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              aggregations: [{ type: "operator", operator: "count" }],
              breakouts: [ORDERS_CREATED_AT, PRODUCTS_CREATED_AT],
            },
          ],
        }),
      ),
      ...card,
    }),
    metadata,
  );
}

describe("getSummaryQuestion", () => {
  it("shows a locked pivot table with the column split", () => {
    const question = createQuestion({ display: "line" });
    const columnSplit = {
      rows: ["CREATED_AT_2"],
      columns: ["CREATED_AT"],
      values: ["count"],
    };

    const nextQuestion = getSummaryQuestion(question, question.query(), {
      type: "show",
      columnSplit,
    });

    expect(nextQuestion.display()).toBe("pivot");
    expect(nextQuestion.displayIsLocked()).toBe(true);
    expect(nextQuestion.setting("pivot_table.column_split")).toEqual(
      columnSplit,
    );
  });

  it("gives a column split that updateQuestion renames into the one that was asked for", () => {
    const question = createQuestion({ display: "line" });
    const query = question.query();
    const [ordersCreatedAt] = Lib.breakouts(query, STAGE_INDEX);
    const nextQuery = Lib.removeClause(query, STAGE_INDEX, ordersCreatedAt);
    const columnSplit = {
      rows: ["CREATED_AT"],
      columns: [],
      values: ["count"],
    };

    const nextQuestion = getSummaryQuestion(question, nextQuery, {
      type: "show",
      columnSplit,
    });

    const syncedSettings = syncVizSettingsWithQuery(
      nextQuestion.settings(),
      nextQuery,
      query,
    );
    expect(syncedSettings["pivot_table.column_split"]).toEqual(columnSplit);
  });

  it("unlocks the display and takes the default one when the pivot table is hidden", () => {
    const question = createQuestion({
      display: "pivot",
      displayIsLocked: true,
    });

    const nextQuestion = getSummaryQuestion(question, question.query(), {
      type: "hide",
    });

    expect(nextQuestion.display()).not.toBe("pivot");
    expect(nextQuestion.displayIsLocked()).toBe(false);
  });

  it("keeps a locked display when the wells have no pivot table to show or hide", () => {
    const question = createQuestion({
      display: "pivot",
      displayIsLocked: true,
    });

    const nextQuestion = getSummaryQuestion(question, question.query());

    expect(nextQuestion.display()).toBe("pivot");
    expect(nextQuestion.displayIsLocked()).toBe(true);
  });
});

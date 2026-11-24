import { createMockMetadata } from "__support__/metadata";
import { syncVizSettingsWithQuery } from "metabase/querying/viz-settings/utils/sync-viz-settings";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type {
  FieldRefColumnSplitSetting,
  TestBreakoutSpec,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  canPivotSummary,
  getPivotColumnSplit,
  getSummaryQuestion,
} from "./pivot-question";

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

function createQuestion(
  card: Parameters<typeof createMockCard>[0] = {},
  database = createSampleDatabase(),
) {
  const metadata = createMockMetadata({ databases: [database] });
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

  it("keeps a renamed Rows formula in the rows of the column split that updateQuestion syncs", () => {
    const question = createQuestion({
      display: "pivot",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              expressions: [
                {
                  name: "Order date",
                  value: {
                    type: "operator",
                    operator: "datetime-add",
                    args: [
                      { type: "column", name: "CREATED_AT" },
                      { type: "literal", value: 1 },
                      { type: "literal", value: "day" },
                    ],
                  },
                },
              ],
              aggregations: [{ type: "operator", operator: "count" }],
              breakouts: [
                ORDERS_CREATED_AT,
                { type: "column", name: "Order date", unit: "year" },
              ],
            },
          ],
        }),
      ),
      visualization_settings: {
        "pivot_table.column_split": {
          rows: ["CREATED_AT", "Order date"],
          columns: [],
          values: ["count"],
        },
      },
    });
    const query = question.query();
    const [expression] = Lib.expressions(query, STAGE_INDEX);
    const nextQuery = Lib.replaceClause(
      query,
      STAGE_INDEX,
      expression,
      Lib.withExpressionName(expression, "Ship day"),
    );
    const columnSplit = {
      rows: ["CREATED_AT", "Ship day"],
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
    expect(
      getPivotColumnSplit(nextQuestion.setSettings(syncedSettings)),
    ).toEqual(columnSplit);
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

describe("getPivotColumnSplit", () => {
  const columnSplit = {
    rows: ["CREATED_AT_2"],
    columns: ["CREATED_AT"],
    values: ["count"],
  };

  it("gives the column split of a pivot table", () => {
    const question = createQuestion({
      display: "pivot",
      visualization_settings: { "pivot_table.column_split": columnSplit },
    });

    expect(getPivotColumnSplit(question)).toEqual(columnSplit);
  });

  it("gives nothing when the question shows another visualization or has no column split", () => {
    const tableQuestion = createQuestion({
      display: "table",
      visualization_settings: { "pivot_table.column_split": columnSplit },
    });

    expect(getPivotColumnSplit(tableQuestion)).toBeUndefined();
    expect(
      getPivotColumnSplit(createQuestion({ display: "pivot" })),
    ).toBeUndefined();
  });

  it("gives a column split by field reference by column name, and leaves the one of the question", () => {
    const legacyColumnSplit = {
      rows: [
        [
          "field",
          PRODUCTS.CREATED_AT,
          { "source-field": ORDERS.PRODUCT_ID, "temporal-unit": "month" },
        ],
      ],
      columns: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      values: [["aggregation", 0]],
    } satisfies FieldRefColumnSplitSetting;
    const question = createQuestion({
      display: "pivot",
      visualization_settings: { "pivot_table.column_split": legacyColumnSplit },
    });

    expect(getPivotColumnSplit(question)).toEqual(columnSplit);
    expect(question.setting("pivot_table.column_split")).toEqual(
      legacyColumnSplit,
    );
  });

  it("leaves out a field reference that the query no longer has", () => {
    const question = createQuestion({
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: [
            [
              "field",
              PRODUCTS.CREATED_AT,
              { "source-field": ORDERS.PRODUCT_ID, "temporal-unit": "month" },
            ],
          ],
          columns: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
          values: [
            ["aggregation", 0],
            ["aggregation", 1],
          ],
        },
      },
    });

    expect(getPivotColumnSplit(question)).toEqual(columnSplit);
  });

  it("puts a grouping that the column split doesn't have in the rows, as the pivot table does", () => {
    const question = createQuestion({
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: [],
          columns: ["CREATED_AT"],
          values: ["count"],
        },
      },
    });

    expect(getPivotColumnSplit(question)).toEqual(columnSplit);
  });
});

describe("canPivotSummary", () => {
  const twoStageQuery = Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [{ type: "operator", operator: "count" }],
        breakouts: [ORDERS_CREATED_AT],
      },
      {
        filters: [
          {
            type: "operator",
            operator: ">",
            args: [
              { type: "column", name: "count" },
              { type: "literal", value: 10 },
            ],
          },
        ],
      },
    ],
  });

  it("is possible for a summary in the last stage", () => {
    const question = createQuestion();

    expect(canPivotSummary(question, -1)).toBe(true);
    expect(canPivotSummary(question, 0)).toBe(true);
  });

  it("is not possible when a stage comes after the summary", () => {
    const question = createQuestion({
      dataset_query: Lib.toJsQuery(twoStageQuery),
    });

    expect(canPivotSummary(question, 0)).toBe(false);
    expect(canPivotSummary(question, 1)).toBe(true);
  });

  it("is not possible when the database does not support pivot tables", () => {
    const question = createQuestion(
      {},
      createSampleDatabase({ features: ["expressions"] }),
    );

    expect(canPivotSummary(question, -1)).toBe(false);
  });
});

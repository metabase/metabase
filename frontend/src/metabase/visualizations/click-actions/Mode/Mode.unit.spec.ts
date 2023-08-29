import {
  createOrdersIdDatasetColumn,
  createSampleDatabase,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { getMode } from "metabase/visualizations/click-actions/lib/modes";
import { createMockMetadata } from "__support__/metadata";

import { checkNotNull } from "metabase/core/utils/types";
import type { ClickAction } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import { toLegacyQuery } from "metabase-lib";
import type { ClickObject } from "metabase-lib/queries/drills/types";
import { columnFinder, SAMPLE_METADATA } from "metabase-lib/test-helpers";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import Question from "metabase-lib/Question";

describe("Mode", function () {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });

  // Here we should add extensive tests for returned action objects for every question type
  // This way we will be able to test integrated logic for:
  // * Modes configuration
  // * Drill object creators

  describe("actionsForClick()", () => {
    // this is action-specific so just rudimentary tests here showing that the actionsForClick logic works
    // Action-specific tests would optimally be in their respective test files
    describe("for a question with an aggregation and a time breakout", () => {
      const question = (
        Question.create({
          databaseId: SAMPLE_DB_ID,
          tableId: ORDERS_ID,
          metadata,
        }).query() as StructuredQuery
      )
        .aggregate(["count"])
        .breakout(["field", 1, { "temporal-unit": "day" }])
        .question()
        .setDisplay("table");
      const mode = getMode(question);

      it("has PivotDrill actions", () => {
        const actions = mode?.actionsForClick(undefined, {});

        expect(actions?.[0].name).toBe("breakout-by");
      });
    });

    describe("SortDrill", () => {
      it("should return SortDrill for unsorted question", () => {
        const actions = setup();

        const sortAscDrill = getActionsByType(actions, "sort-ascending")[0];
        expect(sortAscDrill).not.toBeNull();

        const sortDescDrill = getActionsByType(actions, "sort-descending")[0];
        expect(sortDescDrill).not.toBeNull();
      });

      it("should return SortDrill with opposite direction for sorted question", () => {
        const question = Question.create({
          databaseId: SAMPLE_DB_ID,
          tableId: ORDERS_ID,
          metadata: SAMPLE_METADATA,
        });
        const query = question._getMLv2Query();

        const column = columnFinder(query, Lib.orderableColumns(query, -1))(
          "ORDERS",
          "ID",
        );

        const orderedQuery = Lib.orderBy(query, -1, column, "asc");
        const legacy = toLegacyQuery(orderedQuery);
        const orderedQuestion = question.setDatasetQuery(legacy);

        const actions = setup({
          question: orderedQuestion,
        });

        const sortAscDrill = getActionsByType(actions, "sort-ascending")[0];
        expect(sortAscDrill).toBeNull();

        const sortDescDrill = getActionsByType(actions, "sort-descending")[0];
        expect(sortDescDrill).not.toBeNull();
      });
    });
  });
});

function setup({
  question = Question.create({
    databaseId: SAMPLE_DB_ID,
    tableId: ORDERS_ID,
    metadata: SAMPLE_METADATA,
  }),
  clicked = {
    column: createOrdersIdDatasetColumn(),
    value: undefined,
  },
  settings = {},
}: Partial<{
  question: Question;
  clicked: ClickObject | undefined;
  settings: Record<string, any>;
}> = {}) {
  const mode = checkNotNull(getMode(question));

  return mode.actionsForClick(clicked, settings);
}

function getActionsByType(actions: ClickAction[], type: string): ClickAction[] {
  return actions.filter(({ name }) => name === type);
}

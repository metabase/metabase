import type * as Lib from "metabase-lib";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";

import { underlyingRecordsDrill } from "./underlying-records-drill";

// A pivot table question whose viz settings should partially survive the drill:
// the pivot-specific flag must be cleared, but unrelated settings must be kept.
const PIVOT_SETTINGS = {
  "table.pivot": true,
  "table.pivot_column": "CATEGORY",
  "table.cell_column": "count",
  column_settings: {
    '["ref",["field",1,null]]': { column_title: "Vendor2" },
  },
};

function createPivotQuestion() {
  return new Question(
    createMockCard({ visualization_settings: PIVOT_SETTINGS }),
    SAMPLE_METADATA,
  );
}

function getDrilledQuestion(sourceQuestion: Question): Question {
  // applyDrill returns the source question (its query gets swapped in the real
  // flow, but the lingering pivot viz settings are what this drill must reset).
  const applyDrill = () => sourceQuestion;

  const [action] = underlyingRecordsDrill({
    question: sourceQuestion,
    query: sourceQuestion.query(),
    stageIndex: -1,
    drill: {} as Lib.DrillThru,
    drillInfo: {
      type: "drill-thru/underlying-records",
      rowCount: 1,
      tableName: "Products",
    },
    clicked: {} as Lib.ClickObject,
    applyDrill,
  });

  if (!("question" in action) || typeof action.question !== "function") {
    throw new Error("expected a question-producing click action");
  }
  return action.question();
}

describe("underlyingRecordsDrill", () => {
  it("clears the pivot flag when drilling to underlying records (metabase#12368)", () => {
    const settings = getDrilledQuestion(createPivotQuestion()).settings();
    expect(settings["table.pivot"]).toBe(false);
  });

  it("switches the display to a plain table", () => {
    expect(getDrilledQuestion(createPivotQuestion()).display()).toBe("table");
  });

  it("preserves unrelated column settings across the drill (metabase#12368)", () => {
    const settings = getDrilledQuestion(createPivotQuestion()).settings();
    expect(settings.column_settings).toEqual(PIVOT_SETTINGS.column_settings);
  });
});

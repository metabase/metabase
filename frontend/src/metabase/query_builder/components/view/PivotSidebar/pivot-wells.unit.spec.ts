import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_METADATA,
  SAMPLE_PROVIDER,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";

import { STAGE_INDEX, switchExploreView } from "../ExploreBar/utils";

import {
  type PivotFieldItem,
  addToWell,
  getPivotWells,
  moveBreakout,
} from "./pivot-wells";

function createQuestion() {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
  return Question.create({ metadata: SAMPLE_METADATA }).setQuery(query);
}

function getColumnItem(question: Question, name: string): PivotFieldItem {
  const query = question.query();
  const column = Lib.breakoutableColumns(query, STAGE_INDEX).find(
    (column) =>
      Lib.displayInfo(query, STAGE_INDEX, column).longDisplayName === name,
  );
  if (column == null) {
    throw new Error(`No column named ${name}`);
  }
  return { kind: "column", column, label: name };
}

function getWellLabels(question: Question) {
  const { rows, columns, values } = getPivotWells(question);
  return {
    rows: rows.map((item) => item.label),
    columns: columns.map((item) => item.label),
    values: values.map((item) => item.label),
  };
}

function addOrThrow(
  question: Question,
  wellId: "rows" | "columns" | "values",
  name: string,
) {
  const nextQuestion = addToWell(
    question,
    wellId,
    getColumnItem(question, name),
  );
  if (nextQuestion == null) {
    throw new Error(`Couldn't add ${name} to ${wellId}`);
  }
  return nextQuestion;
}

describe("pivot wells", () => {
  it("starts a pivot with a count when the first grouping is added", () => {
    const question = addOrThrow(createQuestion(), "rows", "Created At");
    expect(question.display()).toBe("pivot");
    expect(getWellLabels(question)).toEqual({
      rows: ["Created At: Month"],
      columns: [],
      values: ["Count"],
    });
  });

  it("puts groupings in the well they're dropped on and moves them between wells", () => {
    const withRow = addOrThrow(createQuestion(), "rows", "Created At");
    const withColumn = addOrThrow(withRow, "columns", "Product → Category");
    expect(getWellLabels(withColumn)).toMatchObject({
      rows: ["Created At: Month"],
      columns: ["Category"],
    });

    const moved = moveBreakout(
      withColumn,
      getPivotWells(withColumn).columns[0].name,
      "rows",
    );
    expect(getWellLabels(moved)).toMatchObject({
      rows: ["Created At: Month", "Category"],
      columns: [],
    });
  });

  it("sums numbers dropped on values and rejects metrics as groupings", () => {
    const question = addOrThrow(
      addOrThrow(createQuestion(), "rows", "Created At"),
      "values",
      "Total",
    );
    expect(getWellLabels(question).values).toEqual(["Count", "Sum of Total"]);

    const metric: PivotFieldItem = {
      kind: "metric",
      metric: Lib.availableMetrics(question.query(), STAGE_INDEX)[0],
      label: "A metric",
    };
    expect(addToWell(question, "rows", metric)).toBeNull();
  });
});

describe("switchExploreView", () => {
  it("keeps the layout between a pivot and a chart: rows are the x-axis, columns the series", () => {
    const pivot = addOrThrow(
      addOrThrow(createQuestion(), "rows", "Created At"),
      "columns",
      "Product → Category",
    );
    const { rows, columns } = getPivotWells(pivot);

    const chart = switchExploreView(pivot, "chart");
    expect(chart.display()).toBe("line");
    expect(chart.settings()["graph.dimensions"]).toEqual([
      rows[0].name,
      columns[0].name,
    ]);

    const pivotAgain = switchExploreView(chart, "pivot");
    expect(getWellLabels(pivotAgain)).toMatchObject({
      rows: ["Created At: Month"],
      columns: ["Category"],
    });
  });
});

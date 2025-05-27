import { createMockMetadata } from "__support__/metadata";
import type * as Lib from "metabase-lib";
import { getHelpText } from "metabase-lib/v1/expressions";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { getFilteredClauses } from "./utils";

function setup({
  filter = "",
  expressionMode = "expression",
}: {
  filter?: string;
  expressionMode?: Lib.ExpressionMode;
} = {}) {
  const sampleDatabase = createSampleDatabase();
  const metadata = createMockMetadata({ databases: [sampleDatabase] });
  const database = metadata.database(sampleDatabase.id);
  if (!database) {
    throw new Error("Error in test: sample database not found");
  }
  database.hasFeature = jest.fn().mockReturnValue(true);

  const results = getFilteredClauses({
    filter,
    expressionMode,
    database,
  });
  return { results, database, metadata };
}

describe("getFilteredClauses", () => {
  it("should return all clauses when no filter is passed", () => {
    const { results } = setup();

    // The array should be sorted
    expect(results.map((group) => group.category)).toEqual(
      ["conversion", "date", "logical", "math", "string"].sort(),
    );

    const dateFunctions = results[1];

    // The array should be sorted
    expect(dateFunctions.clauses.map((clause) => clause.displayName)).toEqual(
      [
        "convertTimezone",
        "datetimeAdd",
        "datetimeDiff",
        "datetimeSubtract",
        "day",
        "dayName",
        "hour",
        "interval",
        "intervalStartingFrom",
        "minute",
        "month",
        "monthName",
        "now",
        "quarter",
        "quarterName",
        "relativeDateTime",
        "second",
        "timeSpan",
        "week",
        "weekday",
        "year",
      ].sort(),
    );
  });

  it("should filter clauses", () => {
    const { results } = setup({
      filter: "no",
    });

    // The array should be sorted
    expect(results.map((group) => group.category)).toEqual(
      ["date", "logical", "string"].sort(),
    );

    // The array should be sorted
    expect(results[0].clauses.map((clause) => clause.name)).toEqual(["now"]);
    expect(results[1].clauses.map((clause) => clause.name)).toEqual([
      "not-in",
      "not-null",
    ]);
    expect(results[2].clauses.map((clause) => clause.name)).toEqual([
      "does-not-contain",
      "not-empty",
    ]);
  });

  it("should filter clauses based on display name", () => {
    const { results } = setup({
      filter: "regexex",
    });

    expect(results.map((group) => group.category)).toEqual(["string"].sort());
    expect(results[0].clauses.map((clause) => clause.name)).toEqual([
      "regex-match-first",
    ]);
  });

  it("should not filter clauses based on display name", () => {
    const { results } = setup({
      filter: "regex-match-first",
    });

    expect(results).toHaveLength(0);
  });

  it("should find case", () => {
    const { results, database } = setup({
      filter: "case",
    });

    // The array should be sorted
    expect(results.map((group) => group.category)).toEqual(["logical"].sort());

    // The array should be sorted
    expect(results[0].clauses[0]).toEqual(getHelpText("case", database));
  });
});

import { createMockMetadata } from "__support__/metadata";
import type { StartRule } from "metabase-lib/v1/expressions";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { getFilteredClauses } from "./utils";

function setup({
  filter = "",
  startRule = "expression",
}: {
  filter?: string;
  startRule?: StartRule;
} = {}) {
  const sampleDatabase = createSampleDatabase();
  const metadata = createMockMetadata({ databases: [sampleDatabase] });
  const database = metadata.database(sampleDatabase.id);
  if (!database) {
    throw new Error("Error in test: sample database not found");
  }
  database.hasFeature = jest.fn().mockReturnValue(true);

  return getFilteredClauses({
    filter,
    startRule,
    database,
  });
}

describe("getFilteredClauses", () => {
  it("should return all clauses when no filter is passed", () => {
    const results = setup();

    // The array should be sorted
    expect(results.map((group) => group.category)).toEqual(
      ["conversion", "date", "logical", "math", "string"].sort(),
    );

    const dateFunctions = results[1];

    // The array should be sorted
    expect(dateFunctions.clauses.map((clause) => clause.structure)).toEqual(
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
    const results = setup({
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
    const results = setup({
      filter: "regexex",
    });

    expect(results.map((group) => group.category)).toEqual(["string"].sort());
    expect(results[0].clauses.map((clause) => clause.name)).toEqual([
      "regex-match-first",
    ]);
  });

  it("should not filter clauses based on display name", () => {
    const results = setup({
      filter: "regex-match-first",
    });

    expect(results).toHaveLength(0);
  });

  it("should find case", () => {
    const results = setup({
      filter: "case",
    });

    // The array should be sorted
    expect(results.map((group) => group.category)).toEqual(["logical"].sort());

    // The array should be sorted
    expect(results[0].clauses[0]).toEqual({
      args: [
        {
          description: "Something that should evaluate to `true` or `false`.",
          example: [">", ["dimension", "Weight"], 200],
          name: "condition",
        },
        {
          description:
            "The value that will be returned if the preceding condition is `true`.",
          example: "Large",
          name: "output",
        },
        {
          description: "You can add more conditions to test.",
          example: [
            "args",
            [[">", ["dimension", "Weight"], 150], "Medium", "Small"],
          ],
          name: "…",
        },
      ],
      category: "logical",
      description:
        "Alias for `if()`. Tests an expression against a list of cases and returns the corresponding value of the first matching case, with an optional default value if nothing else is met.",
      docsPage: "case",
      name: "case",
      structure: "case",
      example: {
        operator: "case",
        options: {},
        args: [
          {
            operator: ">",
            options: {},
            args: [
              { operator: "dimension", options: {}, args: ["Weight"] },
              200,
            ],
          },
          "Large",
          {
            operator: ">",
            options: {},
            args: [
              { operator: "dimension", options: {}, args: ["Weight"] },
              150,
            ],
          },
          "Medium",
          "Small",
        ],
      },
    });
  });
});

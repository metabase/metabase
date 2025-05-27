import { createMockMetadata } from "__support__/metadata";
import { createQuery } from "metabase-lib/test-helpers";
import type { DatabaseFeature } from "metabase-types/api";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { complete } from "./__support__";
import { type Options, suggestFunctions } from "./functions";

describe("suggestFunctions", () => {
  function setup({
    expressionMode = "expression",
    reportTimezone = "America/New_York",
    features = undefined,
  }: Partial<Options> & {
    features?: DatabaseFeature[];
  }) {
    const metadata = createMockMetadata({
      databases: [
        createSampleDatabase({
          features,
        }),
      ],
    });
    const query = createQuery({ metadata });
    const source = suggestFunctions({
      expressionMode,
      query,
      metadata,
      reportTimezone,
    });

    return function (doc: string) {
      return complete(source, doc);
    };
  }

  const RESULTS = {
    from: 0,
    to: 4,
    options: [
      {
        label: "concat",
        displayLabel: "concat",
        detail: "Combine two or more strings of text together.",
        matches: [[0, 3]],
        type: "function",
        icon: "function",
        apply: expect.any(Function),
      },
      {
        label: "contains",
        displayLabel: "contains",
        detail:
          "Returns `true` if `$string1` contains `$string2` within it (or `$string3`, etc. if specified).",
        matches: [
          [0, 2],
          [6, 6],
        ],
        icon: "function",
        type: "function",
        apply: expect.any(Function),
      },
      {
        label: "second",
        displayLabel: "second",
        detail:
          "Takes a datetime and returns an integer (`0`-`59`) with the number of the seconds in the minute.",
        matches: [[2, 4]],
        type: "function",
        icon: "function",
        apply: expect.any(Function),
      },
      {
        label: "doesNotContain",
        displayLabel: "doesNotContain",
        detail:
          "Returns `true` if `$string1` does not contain `$string2` within it (and `$string3`, etc. if specified).",
        matches: [
          [1, 1],
          [4, 5],
          [7, 9],
          [13, 13],
        ],
        type: "function",
        icon: "function",
        apply: expect.any(Function),
      },
      {
        apply: expect.any(Function),
        detail:
          "Looks at the values in each argument in order and returns the first non-null value for each row.",
        displayLabel: "coalesce",
        icon: "function",
        label: "coalesce",
        matches: [
          [0, 1],
          [6, 6],
        ],
        type: "function",
      },
      {
        apply: expect.any(Function),
        detail:
          "Takes a datetime and returns an integer (`1`-`12`) with the number of the month in the year.",
        displayLabel: "month",
        icon: "function",
        label: "month",
        matches: [[1, 2]],
        type: "function",
      },
      {
        apply: expect.any(Function),
        detail:
          'Returns the localized short name (eg. `"Apr"`) for the given month number (eg. `4`)',
        displayLabel: "monthName",
        icon: "function",
        label: "monthName",
        matches: [
          [1, 2],
          [5, 5],
        ],
        type: "function",
      },
    ],
  };

  const RESULTS_NO_TEMPLATE = {
    ...RESULTS,
    options: RESULTS.options.map((option) => ({
      ...option,
      apply: undefined,
    })),
  };

  describe("expressionMode = expression", () => {
    const expressionMode = "expression";

    it("should suggest functions", () => {
      const completer = setup({ expressionMode });
      const results = completer("conc|");
      expect(results).toEqual(RESULTS);
    });

    it("should suggest functions, inside a word", () => {
      const completer = setup({ expressionMode });
      const results = completer("con|c");
      expect(results).toEqual(RESULTS);
    });

    it("should suggest functions, before parenthesis", () => {
      const cases = [
        "conc|(",
        "con|c(",
        "conc|()",
        "con|c()",
        "conc|([Foo]",
        "con|c([Foo]",
        "conc|([Foo])",
        "con|c([Foo])",
        "conc| (",
        "con|c (",
        "conc| ()",
        "con|c ()",
        "conc| ([Foo]",
        "con|c ([Foo]",
        "conc| ([Foo])",
        "con|c ([Foo])",
      ];
      for (const doc of cases) {
        const completer = setup({ expressionMode });
        const results = completer(doc);
        expect(results).toEqual(RESULTS_NO_TEMPLATE);
      }
    });

    it("should not suggest offset", async () => {
      const completer = setup({ expressionMode });
      const results = await completer("offse|");
      const options = results?.options.filter(
        (option) => option.label === "offset",
      );
      expect(options).toEqual([]);
    });

    it("should suggest case", async () => {
      const completer = setup({ expressionMode });
      const results = await completer("cas|");
      const options = results?.options.filter(
        (option) => option.label === "case",
      );
      expect(options).toEqual([
        {
          label: "case",
          displayLabel: "case",
          detail:
            "Alias for `if()`. Tests an expression against a list of cases and returns the corresponding value of the first matching case, with an optional default value if nothing else is met.",
          matches: [[0, 2]],
          type: "function",
          icon: "function",
          apply: expect.any(Function),
        },
      ]);
    });

    it("should not suggest unsupported functions", async () => {
      const completer = setup({
        expressionMode,
        features: [],
      });
      const results = await completer("rege|");
      expect(
        results?.options.find((option) => option.label === "regexExtract"),
      ).toBe(undefined);
    });

    it("should suggest supported functions", async () => {
      const completer = setup({
        expressionMode,
        features: ["regex"],
      });
      const results = await completer("rege|");
      expect(
        results?.options.find((option) => option.label === "regexExtract"),
      ).toEqual({
        label: "regexExtract",
        displayLabel: "regexExtract",
        detail:
          "Extracts matching substrings according to a regular expression.",
        matches: [[0, 3]],
        icon: "function",
        type: "function",
        apply: expect.any(Function),
      });
    });
  });

  describe("expressionMode = aggregation", () => {
    const expressionMode = "aggregation";

    it("should not suggest functions", () => {
      const completer = setup({ expressionMode });
      const results = completer("con|");
      expect(results).toEqual(null);
    });
  });

  describe("expressionMode = boolean", () => {
    const expressionMode = "filter";

    it("should suggest functions", () => {
      const completer = setup({ expressionMode });
      const results = completer("conc|");
      expect(results).toEqual(RESULTS);
    });

    it("should suggest functions, inside a word", () => {
      const completer = setup({ expressionMode });
      const results = completer("con|c");
      expect(results).toEqual(RESULTS);
    });

    it("should suggest functions, before parenthesis, inside a word", () => {
      const completer = setup({ expressionMode });
      const results = completer("con|c()");
      expect(results).toEqual(RESULTS_NO_TEMPLATE);
    });
  });

  it("should complete functions whose name starts with the an operator name as a prefix (metabase#55686)", async () => {
    const completer = setup({ expressionMode: "expression" });
    const results = await completer("not|");
    expect(results?.options.map((result) => result.displayLabel)).toEqual([
      "notEmpty",
      "notIn",
      "notNull",
      "doesNotContain",
      "now",
      "intervalStartingFrom",
      "interval",
      "contains",
      "minute",
      "month",
      "length",
      "monthName",
    ]);
  });
});

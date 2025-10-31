import { createMockMetadata } from "__support__/metadata";
import { createQuery } from "metabase-lib/test-helpers";
import type { DatabaseFeature } from "metabase-types/api";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { complete } from "./__support__";
import { type Options, suggestAggregations } from "./aggregations";

describe("suggestAggregations", () => {
  function setup({
    expressionMode = "aggregation",
    features = [],
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
    const source = suggestAggregations({
      expressionMode,
      query,
      metadata,
    });

    return function (doc: string) {
      return complete(source, doc);
    };
  }

  describe("expressionMode = expression", () => {
    const expressionMode = "expression";

    it("should not suggest aggregations", () => {
      const completer = setup({ expressionMode });
      const results = completer("Coun|");
      expect(results).toEqual(null);
    });
  });

  describe("expressionMode = boolean", () => {
    const expressionMode = "filter";

    it("should not suggest aggregations", () => {
      const completer = setup({ expressionMode });
      const results = completer("Coun|");
      expect(results).toEqual(null);
    });
  });

  describe("expressionMode = aggregation", () => {
    const expressionMode = "aggregation";

    const RESULTS = {
      from: 0,
      to: 4,
      options: [
        {
          type: "aggregation",
          label: "Count",
          displayLabel: "Count",
          icon: "function",
          matches: [[0, 3]],
          apply: expect.any(Function),
        },
        {
          type: "aggregation",
          label: "CountIf",
          displayLabel: "CountIf",
          icon: "function",
          matches: [[0, 3]],
          apply: expect.any(Function),
        },
        {
          type: "aggregation",
          label: "CumulativeCount",
          displayLabel: "CumulativeCount",
          icon: "function",
          matches: [
            [0, 1],
            [3, 3],
            [10, 13],
          ],
          apply: expect.any(Function),
        },
        {
          type: "aggregation",
          label: "concat",
          displayLabel: "concat",
          icon: "function",
          matches: [[0, 3]],
          apply: expect.any(Function),
        },
        {
          type: "aggregation",
          label: "contains",
          displayLabel: "contains",
          icon: "function",
          matches: [
            [0, 2],
            [6, 6],
          ],
          apply: expect.any(Function),
        },
        {
          type: "aggregation",
          label: "second",
          displayLabel: "second",
          icon: "function",
          matches: [[2, 4]],
          apply: expect.any(Function),
        },
        {
          type: "aggregation",
          label: "doesNotContain",
          displayLabel: "doesNotContain",
          icon: "function",
          matches: [
            [1, 1],
            [4, 5],
            [7, 9],
            [13, 13],
          ],
          apply: expect.any(Function),
        },
        {
          type: "aggregation",
          label: "coalesce",
          displayLabel: "coalesce",
          icon: "function",
          matches: [
            [0, 1],
            [6, 6],
          ],
          apply: expect.any(Function),
        },
        {
          type: "aggregation",
          label: "CumulativeSum",
          displayLabel: "CumulativeSum",
          icon: "function",
          matches: [
            [0, 1],
            [3, 3],
            [11, 11],
          ],
          apply: expect.any(Function),
        },
        {
          type: "aggregation",
          label: "hour",
          displayLabel: "hour",
          icon: "function",
          matches: [[1, 2]],
          apply: expect.any(Function),
        },
        {
          type: "aggregation",
          label: "month",
          displayLabel: "month",
          icon: "function",
          matches: [[1, 2]],
          apply: expect.any(Function),
        },
        {
          type: "aggregation",
          label: "monthName",
          displayLabel: "monthName",
          icon: "function",
          matches: [
            [1, 2],
            [5, 5],
          ],
          apply: expect.any(Function),
        },
        {
          type: "aggregation",
          label: "notNull",
          displayLabel: "notNull",
          icon: "function",
          matches: [
            [0, 1],
            [3, 4],
          ],
          apply: expect.any(Function),
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

    it("should suggest aggregations", () => {
      const completer = setup({ expressionMode, features: [] });
      const results = completer("Coun|");
      expect(results).toEqual(RESULTS);
    });

    it("should not suggest unsupported aggregations", () => {
      const completer = setup({ expressionMode });
      const results = completer("StandardDev|");
      expect(results).toEqual({
        from: 0,
        to: 11,
        options: [],
      });
    });

    it("should suggest supported aggregations", () => {
      const completer = setup({
        expressionMode,
        features: ["standard-deviation-aggregations"],
      });
      const results = completer("StandardDev|");
      expect(results).toEqual({
        from: 0,
        to: 11,
        options: [
          {
            label: "StandardDeviation",
            displayLabel: "StandardDeviation",
            matches: [[0, 10]],
            type: "aggregation",
            icon: "function",
            apply: expect.any(Function),
          },
        ],
      });
    });

    it("should suggest aggregations, inside a word", () => {
      const completer = setup({ expressionMode });
      const results = completer("Cou|n");
      expect(results).toEqual(RESULTS);
    });

    it("should suggest aggregatoins, before parenthesis", () => {
      const cases = [
        "Coun|(",
        "Cou|n(",
        "Coun|()",
        "Cou|n()",
        "Coun|([Foo]",
        "Cou|n([Foo]",
        "Coun|([Foo])",
        "Cou|n([Foo])",
        "Coun| (",
        "Cou|n (",
        "Coun| ()",
        "Cou|n ()",
        "Coun| ([Foo]",
        "Cou|n ([Foo]",
        "Coun| ([Foo])",
        "Cou|n ([Foo])",
      ];
      for (const doc of cases) {
        const completer = setup({ expressionMode });
        const results = completer(doc);
        expect(results).toEqual(RESULTS_NO_TEMPLATE);
      }
    });
  });
});

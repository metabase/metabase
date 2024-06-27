import _ from "underscore";

import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  SAMPLE_DATABASE,
  SAMPLE_METADATA,
  createQuery,
} from "metabase-lib/test-helpers";
import type { DatasetQuery, Join } from "metabase-types/api";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  REVIEWS,
  REVIEWS_ID,
} from "metabase-types/api/mocks/presets";

import {
  aggregationOpts,
  expressionOpts,
  metadata,
  DEFAULT_QUERY,
} from "./__support__/expressions";
import { sharedMetadata } from "./__support__/shared";
import type { Suggestion } from "./suggest";
import { suggest as suggest_ } from "./suggest";

type Config = { text: string; type: string };
const SEGMENTS_ORDERS: Config[] = [
  { text: "[Expensive Things]", type: "segments" },
];
const FIELDS_ORDERS: Config[] = [
  { text: "[Created At] ", type: "fields" },
  { text: "[Discount] ", type: "fields" },
  { text: "[ID] ", type: "fields" },
  { text: "[Product ID] ", type: "fields" },
  { text: "[Product → Category] ", type: "fields" },
  { text: "[Product → Created At] ", type: "fields" },
  { text: "[Product → Ean] ", type: "fields" },
  { text: "[Product → ID] ", type: "fields" },
  { text: "[Product → Price] ", type: "fields" },
  { text: "[Product → Rating] ", type: "fields" },
  { text: "[Product → Title] ", type: "fields" },
  { text: "[Product → Vendor] ", type: "fields" },
  { text: "[Quantity] ", type: "fields" },
  { text: "[Subtotal] ", type: "fields" },
  { text: "[Tax] ", type: "fields" },
  { text: "[Total] ", type: "fields" },
  { text: "[User ID] ", type: "fields" },
  { text: "[User → Address] ", type: "fields" },
  { text: "[User → Birth Date] ", type: "fields" },
  { text: "[User → City] ", type: "fields" },
  { text: "[User → Created At] ", type: "fields" },
  { text: "[User → Email] ", type: "fields" },
  { text: "[User → ID] ", type: "fields" },
  { text: "[User → Latitude] ", type: "fields" },
  { text: "[User → Longitude] ", type: "fields" },
  { text: "[User → Name] ", type: "fields" },
  { text: "[User → Password] ", type: "fields" },
  { text: "[User → Source] ", type: "fields" },
  { text: "[User → State] ", type: "fields" },
  { text: "[User → Zip] ", type: "fields" },
];

// custom metadata defined in __support__/expressions
const METRICS_CUSTOM = [{ type: "metrics", text: "[metric]" }];
const FIELDS_CUSTOM = [
  { type: "fields", text: "[A] " },
  { type: "fields", text: "[B] " },
  { type: "fields", text: "[C] " },
  // quoted because conflicts with aggregation
  { type: "fields", text: "[Sum] " },
  // quoted because has a space
  { type: "fields", text: "[Toucan Sam] " },
  // quoted because conflicts with aggregation
  { type: "fields", text: "[count] " },
];

const FIELDS_CUSTOM_NON_NUMERIC = [
  { type: "fields", text: "[date] " },
  { type: "fields", text: "[text] " },
];

describe("metabase/lib/expression/suggest", () => {
  describe("suggest()", () => {
    function suggest(...args: Parameters<typeof suggest_>) {
      return cleanSuggestions(suggest_(...args).suggestions);
    }

    function helpText(...args: Parameters<typeof suggest_>) {
      return suggest_(...args).helpText;
    }

    describe("expression", () => {
      it("should suggest partial matches in expression", () => {
        expect(
          suggest({
            source: "1 + C",
            ...expressionOpts,
            query: createQuery({
              metadata,
              query: DEFAULT_QUERY,
            }),
            stageIndex: -1,
            expressionIndex: undefined,
            metadata,
            getColumnIcon: () => "icon",
          }),
        ).toEqual([
          { type: "fields", text: "[C] " },
          { type: "fields", text: "[count] " },
          { type: "functions", text: "case(" },
          { type: "functions", text: "ceil(" },
          // FIXME: the last three should not appear
          { type: "functions", text: "coalesce(" },
          { type: "functions", text: "concat(" },
          { type: "functions", text: "contains(" },
        ]);
      });

      it("should suggest partial matches in unterminated quoted string", () => {
        expect(
          suggest({
            source: "1 + [C",
            ...expressionOpts,
            query: createQuery({
              metadata,
              query: DEFAULT_QUERY,
            }),
            stageIndex: -1,
            expressionIndex: undefined,
            metadata,
            getColumnIcon: () => "icon",
          }),
        ).toEqual([
          { type: "fields", text: "[C] " },
          { type: "fields", text: "[count] " },
        ]);
      });

      it("should suggest foreign fields", () => {
        expect(
          suggest({
            source: "User",
            query: createQuery(),
            startRule: "expression",
            stageIndex: -1,
            expressionIndex: undefined,
            metadata: SAMPLE_METADATA,
            getColumnIcon: () => "icon",
          }),
        ).toEqual([
          { text: "[User ID] ", type: "fields" },
          { text: "[User → Address] ", type: "fields" },
          { text: "[User → Birth Date] ", type: "fields" },
          { text: "[User → City] ", type: "fields" },
          { text: "[User → Created At] ", type: "fields" },
          { text: "[User → Email] ", type: "fields" },
          { text: "[User → ID] ", type: "fields" },
          { text: "[User → Latitude] ", type: "fields" },
          { text: "[User → Longitude] ", type: "fields" },
          { text: "[User → Name] ", type: "fields" },
          { text: "[User → Password] ", type: "fields" },
          { text: "[User → Source] ", type: "fields" },
          { text: "[User → State] ", type: "fields" },
          { text: "[User → Zip] ", type: "fields" },
        ]);
      });

      it("should suggest joined fields", () => {
        const JOIN_CLAUSE: Join = {
          alias: "Foo",
          "source-table": REVIEWS_ID,
          condition: [
            "=",
            ["field", REVIEWS.PRODUCT_ID, null],
            ["field", ORDERS.PRODUCT_ID, null],
          ],
        };
        const queryWithJoins: DatasetQuery = {
          database: SAMPLE_DATABASE.id,
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            joins: [JOIN_CLAUSE],
          },
        };

        const query = createQuery({
          metadata: sharedMetadata,
          query: queryWithJoins,
        });

        expect(
          suggest({
            source: "Foo",
            query,
            stageIndex: -1,
            expressionIndex: undefined,
            metadata: sharedMetadata,
            getColumnIcon: () => "icon",
            startRule: "expression",
          }),
        ).toEqual([
          { text: "[Foo → Body] ", type: "fields" },
          { text: "[Foo → Created At] ", type: "fields" },
          { text: "[Foo → ID] ", type: "fields" },
          { text: "[Foo → Product ID] ", type: "fields" },
          { text: "[Foo → Rating] ", type: "fields" },
          { text: "[Foo → Reviewer] ", type: "fields" },
        ]);
      });

      it("should suggest nested query fields", () => {
        const datasetQuery: DatasetQuery = {
          database: SAMPLE_DATABASE.id,
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [["field", ORDERS.TOTAL, null]],
          },
        };

        const queryWithAggregation = createQuery({
          metadata: sharedMetadata,
          query: datasetQuery,
        });

        const query = Lib.appendStage(queryWithAggregation);
        const stageIndexAfterNesting = 1;

        expect(
          suggest({
            source: "T",
            query,
            stageIndex: stageIndexAfterNesting,
            expressionIndex: undefined,
            metadata: sharedMetadata,
            getColumnIcon: () => "icon",
            startRule: "expression",
          }),
        ).toEqual(
          [
            { text: "True", type: "literal" },
            { text: "[Total] ", type: "fields" },
            { text: "timeSpan(", type: "functions" },
            { text: "trim(", type: "functions" },
          ].sort(suggestionSort),
        );
      });

      it("should provide help text for the function", () => {
        expect(
          helpText({
            source: "substring(",
            query: createQuery(),
            startRule: "expression",
            metadata: SAMPLE_METADATA,
            getColumnIcon: () => "icon",
            stageIndex: -1,
            expressionIndex: undefined,
          }),
        ).toMatchObject({
          structure: "substring",
          example: "substring([Title], 1, 10)",
          args: expect.objectContaining({ length: 3 }),
        });
      });

      it("should provide help text for the unique match", () => {
        expect(
          helpText({
            source: "lower", // doesn't need to be "lower(" since it's a unique match
            query: createQuery(),
            metadata: SAMPLE_METADATA,
            startRule: "expression",
            stageIndex: -1,
            expressionIndex: undefined,
            getColumnIcon: () => "icon",
          }),
        ).toMatchObject({
          structure: "lower",
          example: "lower([Status])",
          args: expect.objectContaining({ length: 1 }),
        });
      });

      it("should not provide help text for an unsupported function (metabase#39766)", () => {
        const metadata = createMockMetadata({
          databases: [
            createSampleDatabase({
              features: ["foreign-keys"],
            }),
          ],
        });

        expect(
          helpText({
            source: "percentile",
            query: createQuery(),
            metadata,
            startRule: "expression",
            stageIndex: -1,
            expressionIndex: undefined,
            getColumnIcon: () => "icon",
          }),
        ).toBeUndefined();
      });

      it("should provide help text after first argument if there's only one argument", () => {
        expect(
          helpText({
            source: "trim(Total ",
            query: createQuery(),
            metadata: SAMPLE_METADATA,
            stageIndex: -1,
            expressionIndex: undefined,
            getColumnIcon: () => "icon",
            startRule: "expression",
          })?.name,
        ).toEqual("trim");
      });

      it("should provide help text after first argument if there's more than one argument", () => {
        expect(
          helpText({
            source: "coalesce(Total ",
            query: createQuery(),
            metadata: SAMPLE_METADATA,
            stageIndex: -1,
            expressionIndex: undefined,
            getColumnIcon: () => "icon",
            startRule: "expression",
          })?.name,
        ).toEqual("coalesce");
      });
    });

    describe("aggregation", () => {
      it("should suggest aggregations and metrics", () => {
        const { startRule } = aggregationOpts;
        expect(
          suggest({
            source: "case([",
            query: createQuery({
              metadata,
              query: DEFAULT_QUERY,
            }),
            stageIndex: -1,
            expressionIndex: undefined,
            metadata,
            getColumnIcon: () => "icon",
            startRule,
          }),
        ).toEqual(
          [
            ...FIELDS_CUSTOM,
            ...METRICS_CUSTOM,
            ...FIELDS_CUSTOM_NON_NUMERIC,
            { type: "segments", text: "[segment]" },
          ].sort(suggestionSort),
        );
      });

      it("should suggest partial matches after an aggregation", () => {
        expect(
          suggest({
            source: "average(c",
            ...aggregationOpts,
            query: createQuery({
              metadata,
              query: DEFAULT_QUERY,
            }),
            stageIndex: -1,
            expressionIndex: undefined,
            metadata,
            getColumnIcon: () => "icon",
          }),
        ).toEqual([
          // FIXME: the next four should not appear
          { type: "aggregations", text: "Count " },
          { type: "aggregations", text: "CountIf(" },
          { type: "aggregations", text: "CumulativeCount " },
          { type: "aggregations", text: "CumulativeSum(" },
          { type: "fields", text: "[C] " },
          { type: "fields", text: "[count] " },
          { type: "functions", text: "case(" },
          { type: "functions", text: "ceil(" },
          { type: "functions", text: "coalesce(" },
          { type: "functions", text: "concat(" },
          { type: "functions", text: "contains(" },
        ]);
      });

      it("should suggest partial matches in aggregation", () => {
        expect(
          suggest({
            source: "1 + C",
            ...aggregationOpts,
            query: createQuery({
              metadata,
              query: DEFAULT_QUERY,
            }),
            stageIndex: -1,
            expressionIndex: undefined,
            metadata,
            getColumnIcon: () => "icon",
          }),
        ).toEqual([
          { type: "aggregations", text: "Count " },
          { type: "aggregations", text: "CountIf(" },
          { type: "aggregations", text: "CumulativeCount " },
          { type: "aggregations", text: "CumulativeSum(" },
          { type: "fields", text: "[C] " },
          { type: "fields", text: "[count] " },
          { type: "functions", text: "case(" },
          { type: "functions", text: "ceil(" },
          { type: "functions", text: "coalesce(" },
          { type: "functions", text: "concat(" },
          { type: "functions", text: "contains(" },
        ]);
      });

      it("should show suggestions with matched 2-char prefix", () => {
        expect(
          suggest({
            source: "to",
            query: createQuery({ metadata: sharedMetadata }),
            stageIndex: -1,
            expressionIndex: undefined,
            getColumnIcon: () => "icon",
            metadata: sharedMetadata,
            startRule: "aggregation",
          }),
        ).toEqual([
          { type: "metrics", text: "[Total Order Value]" },
          { type: "fields", text: "[Total] " },
        ]);
      });

      it("should show suggestions with matched 3-char prefix", () => {
        expect(
          suggest({
            source: "cou",
            query: createQuery(),
            metadata: SAMPLE_METADATA,
            stageIndex: -1,
            expressionIndex: undefined,
            getColumnIcon: () => "icon",
            startRule: "aggregation",
          }),
        ).toEqual([
          { type: "aggregations", text: "Count " },
          { type: "aggregations", text: "CountIf(" },
        ]);
      });

      it("should show help text in an aggregation function", () => {
        expect(
          helpText({
            source: "Sum(",
            query: createQuery(),
            stageIndex: -1,
            expressionIndex: undefined,
            getColumnIcon: () => "icon",
            metadata: sharedMetadata,
            startRule: "aggregation",
          }),
        ).toMatchObject({ name: "sum", example: "Sum([Subtotal])" });
      });
    });

    describe("filter", () => {
      it("should show suggestions with matched 1-char prefix", () => {
        expect(
          suggest({
            source: "c",
            query: createQuery(),
            metadata: SAMPLE_METADATA,
            stageIndex: -1,
            expressionIndex: undefined,
            getColumnIcon: () => "icon",
            startRule: "boolean",
          }),
        ).toEqual([
          { type: "fields", text: "[Created At] " },
          { type: "fields", text: "[Product → Category] " },
          { type: "fields", text: "[Product → Created At] " },
          { type: "fields", text: "[User → City] " },
          { type: "fields", text: "[User → Created At] " },
          { type: "functions", text: "case(" },
          { type: "functions", text: "ceil(" },
          { type: "functions", text: "coalesce(" },
          { type: "functions", text: "concat(" },
          { type: "functions", text: "contains(" },
        ]);
      });

      it("should show suggestions with matched 2-char prefix", () => {
        expect(
          suggest({
            source: "ca",
            query: createQuery(),
            metadata: SAMPLE_METADATA,
            stageIndex: -1,
            expressionIndex: undefined,
            getColumnIcon: () => "icon",
            startRule: "boolean",
          }),
        ).toEqual([
          { type: "fields", text: "[Product → Category] " },
          { type: "functions", text: "case(" },
        ]);
      });

      it("should show all fields when '[' appears", () => {
        expect(
          suggest({
            source: "[",
            query: createQuery({ metadata: sharedMetadata }),
            stageIndex: -1,
            expressionIndex: undefined,
            getColumnIcon: () => "icon",
            metadata: sharedMetadata,
            startRule: "boolean",
          }),
        ).toEqual([...FIELDS_ORDERS, ...SEGMENTS_ORDERS].sort(suggestionSort));
      });

      it("should show help text in a filter function", () => {
        expect(
          helpText({
            source: "Contains(Total ",
            query: createQuery(),
            metadata: SAMPLE_METADATA,
            stageIndex: -1,
            expressionIndex: undefined,
            getColumnIcon: () => "icon",
            startRule: "boolean",
          }),
        ).toMatchObject({
          name: "contains",
          example: 'contains([Status], "Pass")',
        });
      });
    });

    it("should add the helptext for function suggestions", () => {
      expect(
        suggest_({
          source: "con",
          ...expressionOpts,
          query: createQuery({
            metadata,
            query: DEFAULT_QUERY,
          }),
          stageIndex: -1,
          expressionIndex: undefined,
          metadata,
          getColumnIcon: () => "icon",
        }).suggestions,
      ).toEqual([
        expect.objectContaining({
          type: "functions",
          text: "concat(",
          helpText: expect.objectContaining({
            name: "concat",
          }),
        }),
        expect.objectContaining({
          type: "functions",
          text: "contains(",
          helpText: expect.objectContaining({
            name: "contains",
          }),
        }),
      ]);
    });

    it("should add suggestions for popular functions when no input is given", () => {
      expect(
        suggest_({
          source: "",
          ...expressionOpts,
          startRule: "expression",
          query: createQuery({
            metadata,
            query: DEFAULT_QUERY,
          }),
          stageIndex: -1,
          expressionIndex: undefined,
          metadata,
          getColumnIcon: () => "icon",
        }).suggestions,
      ).toEqual([
        expect.objectContaining({
          name: "case",
          group: "popularExpressions",
        }),
        expect.objectContaining({
          name: "concat",
          group: "popularExpressions",
        }),
        expect.objectContaining({
          name: "contains",
          group: "popularExpressions",
        }),
        expect.objectContaining({
          name: "between",
          group: "popularExpressions",
        }),
        expect.objectContaining({
          name: "coalesce",
          group: "popularExpressions",
        }),
      ]);

      expect(
        suggest_({
          source: "",
          ...expressionOpts,
          startRule: "boolean",
          query: createQuery({
            metadata,
            query: DEFAULT_QUERY,
          }),
          stageIndex: -1,
          expressionIndex: undefined,
          metadata,
          getColumnIcon: () => "icon",
        }).suggestions,
      ).toEqual([
        expect.objectContaining({
          name: "contains",
          group: "popularExpressions",
        }),
        expect.objectContaining({
          name: "case",
          group: "popularExpressions",
        }),
        expect.objectContaining({
          name: "between",
          group: "popularExpressions",
        }),
        expect.objectContaining({
          name: "timeSpan",
          group: "popularExpressions",
        }),
        expect.objectContaining({
          name: "concat",
          group: "popularExpressions",
        }),
      ]);

      expect(
        suggest_({
          source: "",
          ...expressionOpts,
          startRule: "aggregation",
          query: createQuery({
            metadata,
            query: DEFAULT_QUERY,
          }),
          stageIndex: -1,
          expressionIndex: undefined,
          metadata,
          getColumnIcon: () => "icon",
        }).suggestions,
      ).toEqual([
        expect.objectContaining({
          name: "Count",
          group: "popularAggregations",
        }),
        expect.objectContaining({
          name: "Distinct",
          group: "popularAggregations",
        }),
        expect.objectContaining({
          name: "CountIf",
          group: "popularAggregations",
        }),
        expect.objectContaining({
          name: "Sum",
          group: "popularAggregations",
        }),
        expect.objectContaining({
          name: "Average",
          group: "popularAggregations",
        }),
      ]);
    });
  });
});

function cleanSuggestions(suggestions: Suggestion[] | undefined) {
  return _.chain(suggestions)
    .map(s => _.pick(s, "type", "text"))
    .sortBy("text")
    .value();
}

const suggestionSort = (a: Config, b: Config) =>
  a.text < b.text ? -1 : a.text > b.text ? 1 : 0;

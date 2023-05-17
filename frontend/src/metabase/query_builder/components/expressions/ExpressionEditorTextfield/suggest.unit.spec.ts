import _ from "underscore";
import { REVIEWS_ID } from "metabase-types/api/mocks/presets";
import {
  ordersTable,
  ordersTotalField,
} from "../../../../../../test/metabase/lib/expressions/__support__/shared";
import {
  aggregationOpts,
  expressionOpts,
} from "../../../../../../test/metabase/lib/expressions/__support__/expressions";
import { suggest as suggest_, Suggestion } from "./suggest";

type Config = { text: string; type: string };
// custom metadata defined in __support__/sample_database_fixture
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
        expect(suggest({ source: "1 + C", ...expressionOpts })).toEqual([
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
        expect(suggest({ source: "1 + [C", ...expressionOpts })).toEqual([
          { type: "fields", text: "[C] " },
          { type: "fields", text: "[count] " },
        ]);
      });

      it("should suggest foreign fields", () => {
        expect(
          suggest({
            source: "User",
            query: ordersTable.query(),
            startRule: "expression",
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
        expect(
          suggest({
            source: "Foo",
            query: ordersTable.query().join({
              alias: "Foo",
              "source-table": REVIEWS_ID,
            }),
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
        expect(
          suggest({
            source: "T",
            query: ordersTable
              .query()
              .aggregate(["count"])
              .breakout(ordersTotalField)
              .nest(),
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
            query: ordersTable.query(),
            startRule: "expression",
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
            query: ordersTable.query(),
            startRule: "expression",
          }),
        ).toMatchObject({
          structure: "lower",
          example: "lower([Status])",
          args: expect.objectContaining({ length: 1 }),
        });
      });

      it("should provide help text after first argument if there's only one argument", () => {
        expect(
          helpText({
            source: "trim(Total ",
            query: ordersTable.query(),
            startRule: "expression",
          })?.name,
        ).toEqual("trim");
      });

      it("should provide help text after first argument if there's more than one argument", () => {
        expect(
          helpText({
            source: "coalesce(Total ",
            query: ordersTable.query(),
            startRule: "expression",
          })?.name,
        ).toEqual("coalesce");
      });
    });

    describe("aggregation", () => {
      it("should suggest aggregations and metrics", () => {
        expect(suggest({ source: "case([", ...aggregationOpts })).toEqual(
          [
            ...FIELDS_CUSTOM,
            ...METRICS_CUSTOM,
            ...FIELDS_CUSTOM_NON_NUMERIC,
            { type: "segments", text: "[segment]" },
          ].sort(suggestionSort),
        );
      });

      it("should suggest partial matches after an aggregation", () => {
        expect(suggest({ source: "average(c", ...aggregationOpts })).toEqual([
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
        expect(suggest({ source: "1 + C", ...aggregationOpts })).toEqual([
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
            query: ordersTable.query(),
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
            query: ordersTable.query(),
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
            query: ordersTable.query(),
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
            query: ordersTable.query(),
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
            query: ordersTable.query(),
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
            query: ordersTable.query(),
            startRule: "boolean",
          }),
        ).toEqual([...FIELDS_ORDERS, ...SEGMENTS_ORDERS].sort(suggestionSort));
      });

      it("should show help text in a filter function", () => {
        expect(
          helpText({
            source: "Contains(Total ",
            query: ordersTable.query(),
            startRule: "boolean",
          }),
        ).toMatchObject({
          name: "contains",
          example: 'contains([Status], "Pass")',
        });
      });
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

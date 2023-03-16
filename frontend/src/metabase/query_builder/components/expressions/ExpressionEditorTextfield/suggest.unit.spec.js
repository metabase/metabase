import _ from "underscore";
import { ORDERS, REVIEWS } from "__support__/sample_database_fixture";
import {
  aggregationOpts,
  expressionOpts,
} from "../../../../../../test/metabase/lib/expressions/__support__/expressions";
import { suggest as suggest_ } from "./suggest";

// custom metadata defined in __support__/sample_database_fixture
const SEGMENTS_ORDERS = [{ text: "[Expensive Things]", type: "segments" }];
const FIELDS_ORDERS = [
  { text: "[Created At] ", type: "fields" },
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
    function suggest(...args) {
      return cleanSuggestions(suggest_(...args).suggestions);
    }

    function helpText(...args) {
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
            query: ORDERS.query(),
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
            query: ORDERS.query().join({
              alias: "Foo",
              "source-table": REVIEWS.id,
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
            query: ORDERS.query()
              .aggregate(["count"])
              .breakout(ORDERS.TOTAL)
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
        const { structure, example, args } = helpText({
          source: "substring(",
          query: ORDERS.query(),
          startRule: "expression",
        });
        expect(structure).toEqual("substring");
        expect(example).toEqual("substring([Title], 1, 10)");
        expect(args).toHaveLength(3);
      });

      it("should provide help text for the unique match", () => {
        const { structure, example, args } = helpText({
          source: "lower", // doesn't need to be "lower(" since it's a unique match
          query: ORDERS.query(),
          startRule: "expression",
        });
        expect(structure).toEqual("lower");
        expect(example).toEqual("lower([Status])");
        expect(args).toHaveLength(1);
      });

      it("should provide help text after first argument if there's only one argument", () => {
        expect(
          helpText({
            source: "trim(Total ",
            query: ORDERS.query(),
            startRule: "expression",
          }).name,
        ).toEqual("trim");
      });

      it("should provide help text after first argument if there's more than one argument", () => {
        expect(
          helpText({
            source: "coalesce(Total ",
            query: ORDERS.query(),
            startRule: "expression",
          }).name,
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
            query: ORDERS.query(),
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
            query: ORDERS.query(),
            startRule: "aggregation",
          }),
        ).toEqual([
          { type: "aggregations", text: "Count " },
          { type: "aggregations", text: "CountIf(" },
        ]);
      });

      it("should show help text in an aggregation function", () => {
        const { name, example } = helpText({
          source: "Sum(",
          query: ORDERS.query(),
          startRule: "aggregation",
        });
        expect(name).toEqual("sum");
        expect(example).toEqual("Sum([Subtotal])");
      });
    });

    describe("filter", () => {
      it("should show suggestions with matched 1-char prefix", () => {
        expect(
          suggest({ source: "c", query: ORDERS.query(), startRule: "boolean" }),
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
            query: ORDERS.query(),
            startRule: "boolean",
          }),
        ).toEqual([
          { type: "fields", text: "[Product → Category] " },
          { type: "functions", text: "case(" },
        ]);
      });

      it("should show all fields when '[' appears", () => {
        expect(
          suggest({ source: "[", query: ORDERS.query(), startRule: "boolean" }),
        ).toEqual([...FIELDS_ORDERS, ...SEGMENTS_ORDERS].sort(suggestionSort));
      });

      it("should show help text in a filter function", () => {
        const { name, example } = helpText({
          source: "Contains(Total ",
          query: ORDERS.query(),
          startRule: "boolean",
        });
        expect(name).toEqual("contains");
        expect(example).toEqual('contains([Status], "Pass")');
      });
    });
  });
});

function cleanSuggestions(suggestions) {
  return _.chain(suggestions)
    .map(s => _.pick(s, "type", "text"))
    .sortBy("text")
    .value();
}

const suggestionSort = (a, b) =>
  a.text < b.text ? -1 : a.text > b.text ? 1 : 0;

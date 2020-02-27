import { suggest } from "metabase/lib/expressions/suggest";

import _ from "underscore";

import { aggregationOpts, expressionOpts } from "./__support__/expressions";
import { ORDERS, REVIEWS } from "__support__/sample_dataset_fixture";

const AGGREGATION_FUNCTIONS = [
  { type: "aggregations", text: "Average(" },
  { type: "aggregations", text: "Count " },
  { type: "aggregations", text: "CumulativeCount " },
  { type: "aggregations", text: "CumulativeSum(" },
  { type: "aggregations", text: "Distinct(" },
  { type: "aggregations", text: "Max(" },
  { type: "aggregations", text: "Min(" },
  { type: "aggregations", text: "StandardDeviation(" },
  { type: "aggregations", text: "Sum(" },
];
const EXPRESSION_FUNCTIONS = [
  { text: "case(", type: "functions" },
  { text: "coalesce(", type: "functions" },
  { text: "concat(", type: "functions" },
  { text: "extract(", type: "functions" },
  { text: "lower(", type: "functions" },
  { text: "ltrim(", type: "functions" },
  { text: "replace(", type: "functions" },
  { text: "rtrim(", type: "functions" },
  { text: "substring(", type: "functions" },
  { text: "trim(", type: "functions" },
  { text: "upper(", type: "functions" },
];
const FILTER_FUNCTIONS = [
  { text: "between(", type: "functions" },
  { text: "contains(", type: "functions" },
  { text: "endsWith(", type: "functions" },
  { text: "interval(", type: "functions" },
  { text: "startsWith(", type: "functions" },
];
const EXPRESSION_OPERATORS = [
  { text: " * ", type: "operators" },
  { text: " + ", type: "operators" },
  { text: " - ", type: "operators" },
  { text: " / ", type: "operators" },
];
const FILTER_OPERATORS = [
  { text: " != ", type: "operators" },
  { text: " < ", type: "operators" },
  { text: " <= ", type: "operators" },
  { text: " = ", type: "operators" },
  { text: " > ", type: "operators" },
  { text: " >= ", type: "operators" },
];
const UNARY_BOOLEAN_OPERATORS = [{ text: " NOT ", type: "operators" }];
const BINARY_BOOLEAN_OPERATORS = [
  { text: " AND ", type: "operators" },
  { text: " OR ", type: "operators" },
];
const OPEN_PAREN = { type: "other", text: " (" };
const CLOSE_PAREN = { type: "other", text: ") " };
const COMMA = { type: "other", text: ", " };

// custom metadata defined in __support__/expressions
const METRICS_CUSTOM = [{ type: "metrics", text: "metric" }];
const FIELDS_CUSTOM = [
  // quoted because conflicts with aggregation
  { type: "fields", text: '"Sum" ' },
  // quoted because has a space
  { type: "fields", text: '"Toucan Sam" ' },
  // quoted because conflicts with aggregation
  { type: "fields", text: '"count" ' },
  { type: "fields", text: "A " },
  { type: "fields", text: "B " },
  { type: "fields", text: "C " },
];

// custom metadata defined in __support__/sample_dataset_fixture
const METRICS_ORDERS = [{ type: "metrics", text: '"Total Order Value"' }];
const SEGMENTS_ORDERS = [{ text: '"Expensive Things"', type: "segments" }];
const FIELDS_ORDERS = [
  { text: '"Created At" ', type: "fields" },
  { text: '"Product ID" ', type: "fields" },
  { text: '"Product → Category" ', type: "fields" },
  { text: '"Product → Created At" ', type: "fields" },
  { text: '"Product → Ean" ', type: "fields" },
  { text: '"Product → ID" ', type: "fields" },
  { text: '"Product → Price" ', type: "fields" },
  { text: '"Product → Rating" ', type: "fields" },
  { text: '"Product → Title" ', type: "fields" },
  { text: '"Product → Vendor" ', type: "fields" },
  { text: '"User ID" ', type: "fields" },
  { text: '"User → Address" ', type: "fields" },
  { text: '"User → Birth Date" ', type: "fields" },
  { text: '"User → City" ', type: "fields" },
  { text: '"User → Created At" ', type: "fields" },
  { text: '"User → Email" ', type: "fields" },
  { text: '"User → ID" ', type: "fields" },
  { text: '"User → Latitude" ', type: "fields" },
  { text: '"User → Longitude" ', type: "fields" },
  { text: '"User → Name" ', type: "fields" },
  { text: '"User → Password" ', type: "fields" },
  { text: '"User → Source" ', type: "fields" },
  { text: '"User → State" ', type: "fields" },
  { text: '"User → Zip" ', type: "fields" },
  { text: "ID ", type: "fields" },
  { text: "Subtotal ", type: "fields" },
  { text: "Tax ", type: "fields" },
  { text: "Total ", type: "fields" },
];

describe("metabase/lib/expression/suggest", () => {
  describe("suggest()", () => {
    it("should suggest aggregations and metrics after an operator", () => {
      expect(cleanSuggestions(suggest("1 + ", aggregationOpts))).toEqual([
        ...AGGREGATION_FUNCTIONS,
        ...METRICS_CUSTOM,
        OPEN_PAREN,
      ]);
    });
    it("should suggest fields after an operator", () => {
      expect(cleanSuggestions(suggest("1 + ", expressionOpts))).toEqual([
        ...FIELDS_CUSTOM,
        ...EXPRESSION_FUNCTIONS,
        OPEN_PAREN,
      ]);
    });
    it("should suggest partial matches in aggregation", () => {
      expect(cleanSuggestions(suggest("1 + C", aggregationOpts))).toEqual([
        { type: "aggregations", text: "Count " },
        { type: "aggregations", text: "CumulativeCount " },
        { type: "aggregations", text: "CumulativeSum(" },
      ]);
    });
    it("should suggest partial matches in expression", () => {
      expect(cleanSuggestions(suggest("1 + C", expressionOpts))).toEqual([
        { type: "fields", text: '"count" ' },
        { type: "fields", text: "C " },
        { text: "case(", type: "functions" },
        { text: "coalesce(", type: "functions" },
        { text: "concat(", type: "functions" },
      ]);
    });
    it("should suggest partial matches in unterminated quoted string", () => {
      expect(cleanSuggestions(suggest('1 + "C', expressionOpts))).toEqual([
        { type: "fields", text: '"count" ' },
        { type: "fields", text: "C " },
      ]);
    });
    it("should suggest partial matches after an aggregation", () => {
      expect(cleanSuggestions(suggest("average(c", expressionOpts))).toEqual([
        { type: "fields", text: '"count" ' },
        { type: "fields", text: "C " },
        { text: "case(", type: "functions" },
        { text: "coalesce(", type: "functions" },
        { text: "concat(", type: "functions" },
      ]);
    });
    it("should suggest foreign fields", () => {
      expect(
        cleanSuggestions(
          suggest("User", { query: ORDERS.query(), startRule: "expression" }),
        ),
      ).toEqual([
        { text: '"User ID" ', type: "fields" },
        { text: '"User → Address" ', type: "fields" },
        { text: '"User → Birth Date" ', type: "fields" },
        { text: '"User → City" ', type: "fields" },
        { text: '"User → Created At" ', type: "fields" },
        { text: '"User → Email" ', type: "fields" },
        { text: '"User → ID" ', type: "fields" },
        { text: '"User → Latitude" ', type: "fields" },
        { text: '"User → Longitude" ', type: "fields" },
        { text: '"User → Name" ', type: "fields" },
        { text: '"User → Password" ', type: "fields" },
        { text: '"User → Source" ', type: "fields" },
        { text: '"User → State" ', type: "fields" },
        { text: '"User → Zip" ', type: "fields" },
      ]);
    });
    it("should suggest joined fields", () => {
      expect(
        cleanSuggestions(
          suggest("Foo", {
            query: ORDERS.query().join({
              alias: "Foo",
              "source-table": REVIEWS.id,
            }),
            startRule: "expression",
          }),
        ),
      ).toEqual([
        { text: '"Foo → Body" ', type: "fields" },
        { text: '"Foo → Created At" ', type: "fields" },
        { text: '"Foo → ID" ', type: "fields" },
        { text: '"Foo → Product ID" ', type: "fields" },
        { text: '"Foo → Rating" ', type: "fields" },
        { text: '"Foo → Reviewer" ', type: "fields" },
      ]);
    });
    it("should suggest nested query fields", () => {
      expect(
        cleanSuggestions(
          suggest("", {
            query: ORDERS.query()
              .aggregate(["count"])
              .breakout(ORDERS.TOTAL)
              .nest(),
            startRule: "expression",
          }),
        ),
      ).toEqual([
        { text: '"Count" ', type: "fields" },
        { text: "Total ", type: "fields" },
        ...EXPRESSION_FUNCTIONS,
        OPEN_PAREN,
      ]);
    });

    it("should suggest numeric operators after field in an expression", () => {
      expect(
        cleanSuggestions(
          suggest("Total ", { query: ORDERS.query(), startRule: "expression" }),
        ),
      ).toEqual([...EXPRESSION_OPERATORS]);
    });

    it("should suggest comparison operators after field in a filter", () => {
      expect(
        cleanSuggestions(
          suggest("Total ", { query: ORDERS.query(), startRule: "filter" }),
        ),
      ).toEqual([...FILTER_OPERATORS, ...BINARY_BOOLEAN_OPERATORS]);
    });

    it("should suggest filter functions, fields, and segments in a filter", () => {
      expect(
        cleanSuggestions(
          suggest("", { query: ORDERS.query(), startRule: "filter" }),
        ),
      ).toEqual([
        ...FILTER_FUNCTIONS,
        ...UNARY_BOOLEAN_OPERATORS,
        OPEN_PAREN,
        ...SEGMENTS_ORDERS,
      ]);
    });

    it("should suggest expression functions, and fields in an expression", () => {
      expect(
        cleanSuggestions(
          suggest("", { query: ORDERS.query(), startRule: "expression" }),
        ),
      ).toEqual([...FIELDS_ORDERS, ...EXPRESSION_FUNCTIONS, OPEN_PAREN]);
    });

    it("should suggest aggregations and metrics in an aggregation", () => {
      expect(
        cleanSuggestions(
          suggest("", { query: ORDERS.query(), startRule: "aggregation" }),
        ),
      ).toEqual([...AGGREGATION_FUNCTIONS, ...METRICS_ORDERS, OPEN_PAREN]);
    });

    it("should suggest expression operators after aggregation argument", () => {
      expect(
        cleanSuggestions(
          suggest("Sum(Total ", {
            query: ORDERS.query(),
            startRule: "aggregation",
          }),
        ),
      ).toEqual([...EXPRESSION_OPERATORS, CLOSE_PAREN]);
    });

    it("should suggest comma after first argument if there's more than one", () => {
      expect(
        cleanSuggestions(
          suggest("contains(Total ", {
            query: ORDERS.query(),
            startRule: "filter",
          }),
        ),
      ).toEqual([...EXPRESSION_OPERATORS, CLOSE_PAREN, COMMA]);
    });
  });
});

function cleanSuggestions(suggestions) {
  return _.chain(suggestions)
    .map(s => _.pick(s, "type", "text"))
    .sortBy("text")
    .sortBy("type")
    .value();
}

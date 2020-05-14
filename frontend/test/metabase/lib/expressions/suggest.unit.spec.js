import {
  suggest as suggest_,
  getContext as getContext_,
} from "metabase/lib/expressions/suggest";

import _ from "underscore";

import {
  aggregationOpts,
  expressionOpts,
  filterOpts,
} from "./__support__/expressions";
import { ORDERS, REVIEWS } from "__support__/sample_dataset_fixture";

const AGGREGATION_FUNCTIONS = [
  { type: "aggregations", text: "Average(" },
  { type: "aggregations", text: "Count " },
  { type: "aggregations", text: "CountIf(" },
  { type: "aggregations", text: "CumulativeCount " },
  { type: "aggregations", text: "CumulativeSum(" },
  { type: "aggregations", text: "Distinct(" },
  { type: "aggregations", text: "Max(" },
  { type: "aggregations", text: "Median(" },
  { type: "aggregations", text: "Min(" },
  { type: "aggregations", text: "Percentile(" },
  { type: "aggregations", text: "Share(" },
  { type: "aggregations", text: "StandardDeviation(" },
  { type: "aggregations", text: "Sum(" },
  { type: "aggregations", text: "SumIf(" },
  { type: "aggregations", text: "Variance(" },
];
const STRING_FUNCTIONS = [
  { text: "concat(", type: "functions" },
  { text: "lower(", type: "functions" },
  { text: "ltrim(", type: "functions" },
  { text: "regexextract(", type: "functions" },
  { text: "rtrim(", type: "functions" },
  { text: "replace(", type: "functions" },
  { text: "substring(", type: "functions" },
  { text: "trim(", type: "functions" },
  { text: "upper(", type: "functions" },
];
const NUMERIC_FUNCTIONS = [
  { text: "abs(", type: "functions" },
  { text: "ceil(", type: "functions" },
  { text: "exp(", type: "functions" },
  { text: "floor(", type: "functions" },
  { text: "length(", type: "functions" },
  { text: "log(", type: "functions" },
  { text: "power(", type: "functions" },
  { text: "round(", type: "functions" },
  { text: "sqrt(", type: "functions" },
];

const STRING_FUNCTIONS_EXCLUDING_REGEX = STRING_FUNCTIONS.filter(
  ({ text }) => text !== "regexextract(",
);
// const EXPRESSION_FUNCTIONS = [
//   { text: "case(", type: "functions" },
//   { text: "coalesce(", type: "functions" },
// ];
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

// custom metadata defined in __support__/sample_dataset_fixture
const METRICS_ORDERS = [{ type: "metrics", text: "[Total Order Value]" }];
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

describe("metabase/lib/expression/suggest", () => {
  describe("suggest()", () => {
    function suggest(...args) {
      return cleanSuggestions(suggest_(...args).suggestions);
    }

    function helpText(...args) {
      return suggest_(...args).helpText;
    }

    describe("expression", () => {
      it("should suggest expression functions, and fields in an expression", () => {
        expect(suggest({ source: "", ...expressionOpts })).toEqual([
          ...FIELDS_CUSTOM,
          ...FIELDS_CUSTOM_NON_NUMERIC,
          ...[
            { type: "functions", text: "coalesce(" },
            ...NUMERIC_FUNCTIONS,
            ...STRING_FUNCTIONS_EXCLUDING_REGEX,
          ].sort(suggestionSort),
          OPEN_PAREN,
        ]);
      });

      it("should suggest numeric fields after an aritmetic", () => {
        expect(suggest({ source: "1 + ", ...expressionOpts })).toEqual([
          ...FIELDS_CUSTOM,
          ...NUMERIC_FUNCTIONS,
          OPEN_PAREN,
        ]);
      });
      it("should suggest partial matches in expression", () => {
        expect(suggest({ source: "1 + C", ...expressionOpts })).toEqual([
          { type: "fields", text: "[C] " },
          { type: "fields", text: "[count] " },
          { type: "functions", text: "ceil(" },
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
            source: "",
            query: ORDERS.query()
              .aggregate(["count"])
              .breakout(ORDERS.TOTAL)
              .nest(),
            startRule: "expression",
          }),
        ).toEqual(
          [
            { text: "[Count] ", type: "fields" },
            { text: "[Total] ", type: "fields" },
            { text: "coalesce(", type: "functions" },
            ...STRING_FUNCTIONS,
            ...NUMERIC_FUNCTIONS,
            OPEN_PAREN,
          ].sort(suggestionSort),
        );
      });
      it("should suggest numeric operators after field in an expression", () => {
        expect(
          suggest({
            source: "Total ",
            query: ORDERS.query(),
            startRule: "expression",
          }),
        ).toEqual([...EXPRESSION_OPERATORS]);
      });

      it("should provide help text for the function", () => {
        const { structure, args } = helpText({
          source: "substring(",
          query: ORDERS.query(),
          startRule: "expression",
        });
        expect(structure).toEqual("substring(text, position, length)");
        expect(args).toHaveLength(3);
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

      xit("should suggest boolean options after case(", () => {
        expect(
          suggest({
            source: "case(",
            query: ORDERS.query(),
            startRule: "expression",
          }),
        ).toEqual([...SEGMENTS_ORDERS]);
      });
    });

    describe("aggregation", () => {
      it("should suggest partial matches after an aggregation", () => {
        expect(suggest({ source: "average(c", ...aggregationOpts })).toEqual([
          { type: "fields", text: "[C] " },
          { type: "fields", text: "[count] " },
          // { text: "case(", type: "functions" },
          // { text: "coalesce(", type: "functions" },
          { text: "ceil(", type: "functions" },
        ]);
      });
      it("should suggest aggregations and metrics after an operator", () => {
        expect(suggest({ source: "1 + ", ...aggregationOpts })).toEqual([
          ...AGGREGATION_FUNCTIONS,
          ...NUMERIC_FUNCTIONS,
          ...METRICS_CUSTOM,
          OPEN_PAREN,
        ]);
      });
      it("should suggest fields after an aggregation without closing paren", () => {
        expect(suggest({ source: "Average(", ...aggregationOpts })).toEqual([
          ...FIELDS_CUSTOM,
          ...NUMERIC_FUNCTIONS,
          OPEN_PAREN,
          CLOSE_PAREN,
        ]);
      });
      it("should suggest fields after an aggregation with closing paren", () => {
        expect(
          suggest({ source: "Average()", ...aggregationOpts, targetOffset: 8 }),
        ).toEqual([
          ...FIELDS_CUSTOM,
          ...NUMERIC_FUNCTIONS,
          OPEN_PAREN,
          CLOSE_PAREN,
        ]);
      });
      it("should suggest partial matches in aggregation", () => {
        expect(suggest({ source: "1 + C", ...aggregationOpts })).toEqual([
          { type: "aggregations", text: "Count " },
          { type: "aggregations", text: "CountIf(" },
          { type: "aggregations", text: "CumulativeCount " },
          { type: "aggregations", text: "CumulativeSum(" },
          { type: "functions", text: "ceil(" },
        ]);
      });

      it("should suggest aggregations and metrics in an aggregation", () => {
        expect(
          suggest({
            source: "",
            query: ORDERS.query(),
            startRule: "aggregation",
          }),
        ).toEqual([
          ...AGGREGATION_FUNCTIONS,
          ...NUMERIC_FUNCTIONS,
          ...METRICS_ORDERS,
          OPEN_PAREN,
        ]);
      });

      it("should show help text in an aggregation functiom", () => {
        const { name, example } = helpText({
          source: "Sum(",
          query: ORDERS.query(),
          startRule: "aggregation",
        });
        expect(name).toEqual("sum");
        expect(example).toEqual("sum( [Subtotal] )");
      });
    });

    describe("filter", () => {
      it("should suggest comparison operators after field in a filter", () => {
        expect(
          suggest({
            source: "Total ",
            query: ORDERS.query(),
            startRule: "boolean",
          }),
        ).toEqual([...FILTER_OPERATORS, ...BINARY_BOOLEAN_OPERATORS]);
      });

      it("should suggest filter functions, fields, and segments in a filter", () => {
        expect(
          suggest({ source: "", query: ORDERS.query(), startRule: "boolean" }),
        ).toEqual([
          ...FIELDS_ORDERS,
          ...FILTER_FUNCTIONS,
          ...UNARY_BOOLEAN_OPERATORS,
          OPEN_PAREN,
          ...SEGMENTS_ORDERS,
        ]);
      });

      it("should show help text in a filter function", () => {
        const { name, example } = helpText({
          source: "Contains(Total ",
          query: ORDERS.query(),
          startRule: "boolean",
        });
        expect(name).toEqual("contains");
        expect(example).toEqual('contains([Status] , "Pass")');
      });
    });
  });

  describe("getContext", () => {
    function getContext(...args) {
      return cleanContext(getContext_(...args));
    }

    describe("aggregation", () => {
      it("should get operator context", () => {
        expect(getContext({ source: "1 +", ...aggregationOpts })).toEqual({
          clause: "+",
          expectedType: "aggregation",
          index: 0,
        });
      });
      it("should get operator context with trailing whitespace", () => {
        expect(getContext({ source: "1 + ", ...aggregationOpts })).toEqual({
          clause: "+",
          expectedType: "aggregation",
          index: 0,
        });
      });
      it("should get aggregation context", () => {
        expect(getContext({ source: "Average(", ...aggregationOpts })).toEqual({
          clause: "avg",
          expectedType: "number",
          index: 0,
        });
      });
      it("should get aggregation context with closing paren", () => {
        expect(
          getContext({
            source: "Average()",
            ...aggregationOpts,
            targetOffset: 8,
          }),
        ).toEqual({
          clause: "avg",
          expectedType: "number",
          index: 0,
        });
      });
      it("should get sum-where first argument", () => {
        expect(
          getContext({ source: "1 + SumIf(", ...aggregationOpts }),
        ).toEqual({
          clause: "sum-where",
          expectedType: "number",
          index: 0,
        });
      });
      it("should get sum-where second argument", () => {
        expect(
          getContext({ source: "1 + SumIf(Total = 10,", ...aggregationOpts }),
        ).toEqual({
          clause: "sum-where",
          expectedType: "boolean",
          index: 1,
        });
      });
      it("should get operator context inside aggregation", () => {
        expect(
          getContext({ source: "1 + Sum(2 /", ...aggregationOpts }),
        ).toEqual({
          clause: "/",
          expectedType: "number",
          index: 0,
        });
      });
    });
    describe("expression", () => {
      it("should get operator context", () => {
        expect(getContext({ source: "1 +", ...expressionOpts })).toEqual({
          clause: "+",
          expectedType: "number",
          index: 0,
        });
      });
      it("should get function context", () => {
        expect(getContext({ source: "trim(", ...expressionOpts })).toEqual({
          clause: "trim",
          expectedType: "string",
          index: 0,
        });
      });
      xit("should get boolean for first argument of case", () => {
        // it's difficult to type "case" correctly using the current system because the form is:
        //    case([PREDICATE, EXPRESSION]+ [, ELSE-EXPRESSION]?)
        expect(getContext({ source: "case(", ...expressionOpts })).toEqual({
          clause: "case",
          expectedType: "boolean",
          index: 0,
        });
      });
      it("should get expression for second argument of case", () => {
        expect(getContext({ source: "case(Foo,", ...expressionOpts })).toEqual({
          clause: "case",
          expectedType: "expression",
          index: 1,
        });
      });
    });
    describe("filter", () => {
      it("should get function context", () => {
        expect(getContext({ source: "between(", ...filterOpts })).toEqual({
          clause: "between",
          expectedType: "expression",
          index: 0,
        });
      });
    });
  });
});

function cleanContext(context) {
  delete context.clauseToken;
  if (context.clause) {
    context.clause = context.clause.name;
  }
  return context;
}

function cleanSuggestions(suggestions) {
  return _.chain(suggestions)
    .map(s => _.pick(s, "type", "text"))
    .sortBy("text")
    .sortBy("type")
    .value();
}

const suggestionSort = (a, b) =>
  a.type.localeCompare(b.type) || a.text.localeCompare(b.text);

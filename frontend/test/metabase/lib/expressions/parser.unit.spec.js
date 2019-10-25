import { compile, suggest, parse } from "metabase/lib/expressions/parser";
import _ from "underscore";

import { TYPE } from "metabase/lib/types";
import {
  ORDERS,
  REVIEWS,
  makeMetadata,
} from "__support__/sample_dataset_fixture";

const metadata = makeMetadata({
  databases: {
    1: {
      name: "db",
      tables: [1],
      features: [
        "basic-aggregations",
        "standard-deviation-aggregations",
        "expression-aggregations",
        "foreign-keys",
        "native-parameters",
        "expressions",
        "right-join",
        "left-join",
        "inner-join",
        "nested-queries",
      ],
    },
  },
  tables: {
    1: {
      db: 1,
      fields: [1, 2, 3, 10, 11],
    },
  },
  fields: {
    1: { id: 1, table: 1, display_name: "A", base_type: TYPE.Float },
    2: { id: 2, table: 1, display_name: "B", base_type: TYPE.Float },
    3: { id: 3, table: 1, display_name: "C", base_type: TYPE.Float },
    10: { id: 10, table: 1, display_name: "Toucan Sam", base_type: TYPE.Float },
    11: { id: 11, table: 1, display_name: "count", base_type: TYPE.Float },
  },
});

const query = metadata.table(1).query();

const expressionOpts = { query, startRule: "expression" };
const aggregationOpts = { query, startRule: "aggregation" };

describe("lib/expressions/parser", () => {
  describe("compile()", () => {
    it("should return empty array for null or empty string", () => {
      expect(compile()).toEqual([]);
      expect(compile(null)).toEqual([]);
      expect(compile("")).toEqual([]);
    });

    it("can parse simple expressions", () => {
      expect(compile("A", expressionOpts)).toEqual(["field-id", 1]);
      expect(compile("1", expressionOpts)).toEqual(1);
      expect(compile("1.1", expressionOpts)).toEqual(1.1);
    });

    it("can parse single operator math", () => {
      expect(compile("A-B", expressionOpts)).toEqual([
        "-",
        ["field-id", 1],
        ["field-id", 2],
      ]);
      expect(compile("A - B", expressionOpts)).toEqual([
        "-",
        ["field-id", 1],
        ["field-id", 2],
      ]);
      expect(compile("1 - B", expressionOpts)).toEqual([
        "-",
        1,
        ["field-id", 2],
      ]);
      expect(compile("1 - 2", expressionOpts)).toEqual(["-", 1, 2]);
    });

    it("can handle operator precedence", () => {
      expect(compile("1 + 2 * 3", expressionOpts)).toEqual([
        "+",
        1,
        ["*", 2, 3],
      ]);
      expect(compile("1 * 2 + 3", expressionOpts)).toEqual([
        "+",
        ["*", 1, 2],
        3,
      ]);
    });

    it("can collapse consecutive identical operators", () => {
      expect(compile("1 + 2 + 3 * 4 * 5", expressionOpts)).toEqual([
        "+",
        1,
        2,
        ["*", 3, 4, 5],
      ]);
    });

    it("can handle negative number literals", () => {
      expect(compile("1 + -1", expressionOpts)).toEqual(["+", 1, -1]);
    });

    // quoted field name w/ a space in it
    it("can parse a field with quotes and spaces", () => {
      expect(compile('"Toucan Sam" + B', expressionOpts)).toEqual([
        "+",
        ["field-id", 10],
        ["field-id", 2],
      ]);
    });

    // parentheses / nested parens
    it("can parse expressions with parentheses", () => {
      expect(compile("(1 + 2) * 3", expressionOpts)).toEqual([
        "*",
        ["+", 1, 2],
        3,
      ]);
      expect(compile("1 * (2 + 3)", expressionOpts)).toEqual([
        "*",
        1,
        ["+", 2, 3],
      ]);
      expect(compile('"Toucan Sam" + (A * (B / C))', expressionOpts)).toEqual([
        "+",
        ["field-id", 10],
        ["*", ["field-id", 1], ["/", ["field-id", 2], ["field-id", 3]]],
      ]);
    });

    it("can parse aggregation with no arguments", () => {
      expect(compile("Count", aggregationOpts)).toEqual(["count"]);
      expect(compile("Count()", aggregationOpts)).toEqual(["count"]);
    });

    it("can parse aggregation with argument", () => {
      expect(compile("Sum(A)", aggregationOpts)).toEqual([
        "sum",
        ["field-id", 1],
      ]);
    });

    it("can handle negative number literals in aggregations", () => {
      expect(compile("-1 * Count", aggregationOpts)).toEqual([
        "*",
        -1,
        ["count"],
      ]);
    });

    it("can parse complex aggregation", () => {
      expect(compile("1 - Sum(A * 2) / Count", aggregationOpts)).toEqual([
        "-",
        1,
        ["/", ["sum", ["*", ["field-id", 1], 2]], ["count"]],
      ]);
    });

    it("should throw exception on invalid input", () => {
      expect(() => compile("1 + ", expressionOpts)).toThrow();
    });

    it("should treat aggregations as case-insensitive", () => {
      expect(compile("count", aggregationOpts)).toEqual(["count"]);
      expect(compile("cOuNt", aggregationOpts)).toEqual(["count"]);
      expect(compile("average(A)", aggregationOpts)).toEqual([
        "avg",
        ["field-id", 1],
      ]);
    });

    // fks
    // multiple tables with the same field name resolution
  });

  describe("suggest()", () => {
    it("should suggest aggregations and metrics after an operator", () => {
      expect(cleanSuggestions(suggest("1 + ", aggregationOpts))).toEqual([
        { type: "aggregations", text: "Average(" },
        { type: "aggregations", text: "Count " },
        { type: "aggregations", text: "CumulativeCount " },
        { type: "aggregations", text: "CumulativeSum(" },
        { type: "aggregations", text: "Distinct(" },
        { type: "aggregations", text: "Max(" },
        { type: "aggregations", text: "Min(" },
        { type: "aggregations", text: "StandardDeviation(" },
        { type: "aggregations", text: "Sum(" },
        { type: "other", text: " (" },
      ]);
    });
    it("should suggest fields after an operator", () => {
      expect(cleanSuggestions(suggest("1 + ", expressionOpts))).toEqual([
        // quoted because has a space
        { type: "fields", text: '"Toucan Sam" ' },
        // quoted because conflicts with aggregation
        { type: "fields", text: '"count" ' },
        { type: "fields", text: "A " },
        { type: "fields", text: "B " },
        { type: "fields", text: "C " },
        { type: "other", text: " (" },
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
      ]);
    });
    it("should suggest partial matches after an aggregation", () => {
      expect(cleanSuggestions(suggest("average(c", expressionOpts))).toEqual([
        { type: "fields", text: '"count" ' },
        { type: "fields", text: "C " },
      ]);
    });
    it("should suggest foreign fields", () => {
      expect(
        cleanSuggestions(
          suggest("User", { query: ORDERS.query(), startRule: "expression" }),
        ),
      ).toEqual([
        { text: '"User ID" ', type: "fields" },
        { text: '"User → ID" ', type: "fields" },
        { text: '"User → Latitude" ', type: "fields" },
        { text: '"User → Longitude" ', type: "fields" },
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
        { text: '"Foo → ID" ', type: "fields" },
        { text: '"Foo → Product ID" ', type: "fields" },
        { text: '"Foo → Rating" ', type: "fields" },
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
        { text: " (", type: "other" },
      ]);
    });
  });

  describe("compile() in syntax mode", () => {
    it("should parse source without whitespace into a recoverable syntax tree", () => {
      const source = '1-Sum(A*2+"Toucan Sam")/Count()';
      const tree = parse(source, aggregationOpts);
      expect(serialize(tree)).toEqual(source);
    });
    xit("should parse source with whitespace into a recoverable syntax tree", () => {
      // FIXME: not preserving whitespace
      const source = '1 - Sum(A * 2 + "Toucan Sam") / Count';
      const tree = parse(source, aggregationOpts);
      expect(serialize(tree)).toEqual(source);
    });
  });
});

function serialize(tree) {
  if (tree.type === "token") {
    return tree.text;
  } else {
    return tree.children.map(serialize).join("");
  }
}

function cleanSuggestions(suggestions) {
  return _.chain(suggestions)
    .map(s => _.pick(s, "type", "text"))
    .sortBy("text")
    .sortBy("type")
    .value();
}

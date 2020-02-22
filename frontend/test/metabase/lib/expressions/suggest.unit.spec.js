import { suggest } from "metabase/lib/expressions/suggest";

import _ from "underscore";

import { aggregationOpts, expressionOpts } from "./__support__/expressions";
import { ORDERS, REVIEWS } from "__support__/sample_dataset_fixture";

describe("metabase/lib/expression/suggest", () => {
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
        { type: "metrics", text: "metric" },
        { type: "other", text: " (" },
      ]);
    });
    it("should suggest fields after an operator", () => {
      expect(cleanSuggestions(suggest("1 + ", expressionOpts))).toEqual([
        // quoted because conflicts with aggregation
        { type: "fields", text: '"Sum" ' },
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
});

function cleanSuggestions(suggestions) {
  return _.chain(suggestions)
    .map(s => _.pick(s, "type", "text"))
    .sortBy("text")
    .sortBy("type")
    .value();
}

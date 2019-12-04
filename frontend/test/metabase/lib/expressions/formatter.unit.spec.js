import { format } from "metabase/lib/expressions/formatter";

import { makeMetadata } from "__support__/sample_dataset_fixture";

const metadata = makeMetadata({
  fields: {
    1: { display_name: "A" },
    2: { display_name: "B" },
    3: { display_name: "C" },
    10: { display_name: "Toucan Sam" },
    11: { display_name: "count" },
    12: { display_name: "Count" },
  },
  metrics: { 1: { name: "foo bar" } },
});

const query = metadata
  .table(1)
  .newQuestion()
  .query();

describe("lib/expressions/parser", () => {
  describe("format", () => {
    it("can format simple expressions", () => {
      expect(
        format(["+", ["field-id", 1], ["field-id", 2]], { query }),
      ).toEqual("A + B");
    });

    it("can format expressions with parentheses", () => {
      expect(
        format(
          ["+", ["/", ["field-id", 1], ["field-id", 2]], ["field-id", 3]],
          { query },
        ),
      ).toEqual("(A / B) + C");
      expect(
        format(
          [
            "+",
            ["/", ["field-id", 1], ["*", ["field-id", 2], ["field-id", 2]]],
            ["field-id", 3],
          ],
          { query },
        ),
      ).toEqual("(A / (B * B)) + C");
    });

    it("quotes fields with spaces in them", () => {
      expect(
        format(
          ["+", ["/", ["field-id", 1], ["field-id", 10]], ["field-id", 3]],
          { query },
        ),
      ).toEqual('(A / "Toucan Sam") + C');
    });

    it("quotes fields that conflict with reserved words", () => {
      expect(format(["+", 1, ["field-id", 11]], { query })).toEqual(
        '1 + "count"',
      );
      expect(format(["+", 1, ["field-id", 12]], { query })).toEqual(
        '1 + "Count"',
      );
    });

    it("format aggregations", () => {
      expect(format(["count"], { query })).toEqual("Count");
      expect(format(["sum", ["field-id", 1]], { query })).toEqual("Sum(A)");
    });

    it("nested aggregation", () => {
      expect(format(["+", 1, ["count"]], { query })).toEqual("1 + Count");
      expect(
        format(["/", ["sum", ["field-id", 1]], ["count"]], { query }),
      ).toEqual("Sum(A) / Count");
    });

    it("aggregation with expressions", () => {
      expect(
        format(["sum", ["/", ["field-id", 1], ["field-id", 2]]], { query }),
      ).toEqual("Sum(A / B)");
    });

    it("expression with metric", () => {
      expect(format(["+", 1, ["metric", 1]], { query })).toEqual(
        '1 + "foo bar"',
      );
    });

    it("expression with custom field", () => {
      expect(
        format(["+", 1, ["sum", ["expression", "foo bar"]]], { query }),
      ).toEqual('1 + Sum("foo bar")');
    });
  });
});

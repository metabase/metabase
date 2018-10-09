import { format } from "metabase/lib/expressions/formatter";

const mockMetadata = {
  tableMetadata: {
    fields: [
      { id: 1, display_name: "A" },
      { id: 2, display_name: "B" },
      { id: 3, display_name: "C" },
      { id: 10, display_name: "Toucan Sam" },
      { id: 11, display_name: "count" },
      { id: 12, display_name: "Count" },
    ],
    metrics: [{ id: 1, name: "foo bar" }],
  },
};

describe("lib/expressions/parser", () => {
  describe("format", () => {
    it("can format simple expressions", () => {
      expect(
        format(["+", ["field-id", 1], ["field-id", 2]], mockMetadata),
      ).toEqual("A + B");
    });

    it("can format expressions with parentheses", () => {
      expect(
        format(
          ["+", ["/", ["field-id", 1], ["field-id", 2]], ["field-id", 3]],
          mockMetadata,
        ),
      ).toEqual("(A / B) + C");
      expect(
        format(
          [
            "+",
            ["/", ["field-id", 1], ["*", ["field-id", 2], ["field-id", 2]]],
            ["field-id", 3],
          ],
          mockMetadata,
        ),
      ).toEqual("(A / (B * B)) + C");
    });

    it("quotes fields with spaces in them", () => {
      expect(
        format(
          ["+", ["/", ["field-id", 1], ["field-id", 10]], ["field-id", 3]],
          mockMetadata,
        ),
      ).toEqual('(A / "Toucan Sam") + C');
    });

    it("quotes fields that conflict with reserved words", () => {
      expect(format(["+", 1, ["field-id", 11]], mockMetadata)).toEqual(
        '1 + "count"',
      );
      expect(format(["+", 1, ["field-id", 12]], mockMetadata)).toEqual(
        '1 + "Count"',
      );
    });

    it("format aggregations", () => {
      expect(format(["count"], mockMetadata)).toEqual("Count");
      expect(format(["sum", ["field-id", 1]], mockMetadata)).toEqual("Sum(A)");
    });

    it("nested aggregation", () => {
      expect(format(["+", 1, ["count"]], mockMetadata)).toEqual("1 + Count");
      expect(
        format(["/", ["sum", ["field-id", 1]], ["count"]], mockMetadata),
      ).toEqual("Sum(A) / Count");
    });

    it("aggregation with expressions", () => {
      expect(
        format(["sum", ["/", ["field-id", 1], ["field-id", 2]]], mockMetadata),
      ).toEqual("Sum(A / B)");
    });

    it("expression with metric", () => {
      expect(format(["+", 1, ["metric", 1]], mockMetadata)).toEqual(
        '1 + "foo bar"',
      );
    });

    it("expression with custom field", () => {
      expect(
        format(["+", 1, ["sum", ["expression", "foo bar"]]], mockMetadata),
      ).toEqual('1 + Sum("foo bar")');
    });
  });
});

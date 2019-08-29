import Aggregation from "metabase-lib/lib/queries/structured/Aggregation";

import {
  question,
  ORDERS_TOTAL_FIELD_ID,
} from "__support__/sample_dataset_fixture";

const query = question.query();

function aggregationForMBQL(mbql) {
  return new Aggregation(mbql, 0, query);
}

describe("Aggregation", () => {
  describe("displayName", () => {
    it("should format basic aggregation", () => {
      expect(aggregationForMBQL(["count"]).displayName()).toEqual(
        "Count of rows",
      );
    });
    it("should format custom aggregation", () => {
      expect(
        aggregationForMBQL([
          "+",
          ["sum", ["field-id", ORDERS_TOTAL_FIELD_ID]],
          42,
        ]).displayName(),
      ).toEqual("Sum(Total) + 42");
    });
    it("should format custom aggregation with expression inside aggregation", () => {
      expect(
        aggregationForMBQL([
          "sum",
          ["+", ["field-id", ORDERS_TOTAL_FIELD_ID], 42],
        ]).displayName(),
      ).toEqual("Sum(Total + 42)");
    });
    it("should format named aggregation", () => {
      expect(
        aggregationForMBQL([
          "aggregation-options",
          ["sum", ["field-id", ORDERS_TOTAL_FIELD_ID]],
          { "display-name": "named" },
        ]).displayName(),
      ).toEqual("named");
    });
    it("should format saved metric", () => {
      expect(aggregationForMBQL(["metric", 1]).displayName()).toEqual(
        "Total Order Value",
      );
    });
    it("should format aggregation with aggregation-options but not display-name", () => {
      expect(
        aggregationForMBQL([
          "aggregation-options",
          ["sum", ["field-id", ORDERS_TOTAL_FIELD_ID]],
          {},
        ]).displayName(),
      ).toEqual("Sum of Total");
    });
  });
  describe("isValid", () => {
    it("should be true for basic aggregation", () => {
      expect(aggregationForMBQL(["count"]).isValid()).toBe(true);
    });
    it("should be true for custom aggregation", () => {
      expect(
        aggregationForMBQL([
          "+",
          ["sum", ["field-id", ORDERS_TOTAL_FIELD_ID]],
          42,
        ]).isValid(),
      ).toBe(true);
    });
    it("should be true for custom aggregation with expression inside aggregation", () => {
      expect(
        aggregationForMBQL([
          "sum",
          ["+", ["field-id", ORDERS_TOTAL_FIELD_ID], 42],
        ]).isValid(),
      ).toBe(true);
    });
    it("should be true for named aggregation", () => {
      expect(
        aggregationForMBQL([
          "aggregation-options",
          ["sum", ["field-id", ORDERS_TOTAL_FIELD_ID]],
          { "display-name": "named" },
        ]).isValid(),
      ).toBe(true);
    });
    it("should be true for saved metric", () => {
      expect(aggregationForMBQL(["metric", 1]).isValid()).toBe(true);
    });
    it("should be true for aggregation with aggregation-options but not display-name", () => {
      expect(
        aggregationForMBQL([
          "aggregation-options",
          ["sum", ["field-id", ORDERS_TOTAL_FIELD_ID]],
          {},
        ]).isValid(),
      ).toBe(true);
    });
  });
});

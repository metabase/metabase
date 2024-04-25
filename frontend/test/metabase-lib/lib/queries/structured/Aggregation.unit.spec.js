import { createMockMetadata } from "__support__/metadata";
import Aggregation from "metabase-lib/v1/queries/structured/Aggregation";
import { createMockMetric } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";

const TOTAL_ORDER_VALUE_METRIC = createMockMetric({
  id: 1,
  name: "Total Order Value",
  table_id: ORDERS_ID,
});

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
  metrics: [TOTAL_ORDER_VALUE_METRIC],
});

const query = metadata
  .table(ORDERS_ID)
  .legacyQuery({ useStructuredQuery: true });

function aggregationForMBQL(mbql) {
  return new Aggregation(mbql, 0, query);
}

describe("Aggregation", () => {
  describe("displayName", () => {
    it("should format basic aggregation", () => {
      expect(aggregationForMBQL(["count"]).displayName()).toEqual("Count");
    });
    it("should format custom aggregation", () => {
      expect(
        aggregationForMBQL([
          "+",
          ["sum", ["field", ORDERS.TOTAL, null]],
          42,
        ]).displayName(),
      ).toEqual("Sum(Total) + 42");
    });
    it("should format custom aggregation with expression inside aggregation", () => {
      expect(
        aggregationForMBQL([
          "sum",
          ["+", ["field", ORDERS.TOTAL, null], 42],
        ]).displayName(),
      ).toEqual("Sum(Total + 42)");
    });
    it("should format named aggregation", () => {
      expect(
        aggregationForMBQL([
          "aggregation-options",
          ["sum", ["field", ORDERS.TOTAL, null]],
          { "display-name": "named" },
        ]).displayName(),
      ).toEqual("named");
    });
    it("should format saved metric", () => {
      expect(
        aggregationForMBQL([
          "metric",
          TOTAL_ORDER_VALUE_METRIC.id,
        ]).displayName(),
      ).toEqual("Total Order Value");
    });
    it("should format aggregation with aggregation-options but not display-name", () => {
      expect(
        aggregationForMBQL([
          "aggregation-options",
          ["sum", ["field", ORDERS.TOTAL, null]],
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
          ["sum", ["field", ORDERS.TOTAL, null]],
          42,
        ]).isValid(),
      ).toBe(true);
    });
    it("should be true for custom aggregation with expression inside aggregation", () => {
      expect(
        aggregationForMBQL([
          "sum",
          ["+", ["field", ORDERS.TOTAL, null], 42],
        ]).isValid(),
      ).toBe(true);
    });
    it("should be true for named aggregation", () => {
      expect(
        aggregationForMBQL([
          "aggregation-options",
          ["sum", ["field", ORDERS.TOTAL, null]],
          { "display-name": "named" },
        ]).isValid(),
      ).toBe(true);
    });
    it("should be true for saved metric", () => {
      expect(
        aggregationForMBQL(["metric", TOTAL_ORDER_VALUE_METRIC.id]).isValid(),
      ).toBe(true);
    });
    it("should be true for aggregation with aggregation-options but not display-name", () => {
      expect(
        aggregationForMBQL([
          "aggregation-options",
          ["sum", ["field", ORDERS.TOTAL, null]],
          {},
        ]).isValid(),
      ).toBe(true);
    });
  });
});

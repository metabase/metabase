import { createMockMetadata } from "__support__/metadata";
import Metric from "metabase-lib/v1/metadata/Metric";
import Table from "metabase-lib/v1/metadata/Table";
import { createMockMetric } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
  metrics: [
    createMockMetric({
      id: 1,
      table_id: ORDERS_ID,
      name: "Total Order Value",
      definition: {
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        "source-table": ORDERS_ID,
      },
    }),
    createMockMetric({
      id: "ga:users",
      name: "Users",
    }),
  ],
});

describe("Metric", () => {
  describe("Standard database", () => {
    const metric = metadata.metric(1);

    it("should be a Metric", () => {
      expect(metric).toBeInstanceOf(Metric);
    });
    it("should have a Table", () => {
      expect(metric.table).toBeInstanceOf(Table);
    });

    describe("displayName", () => {
      it("should return the metric name", () => {
        expect(metric.displayName()).toBe("Total Order Value");
      });
    });
    describe("aggregationClause", () => {
      it('should return ["metric", 1]', () => {
        expect(metric.aggregationClause()).toEqual(["metric", 1]);
      });
    });
    describe("columnName", () => {
      it("should return the underlying metric definition name", () => {
        expect(metric.columnName()).toBe("sum");
      });
    });
  });
});

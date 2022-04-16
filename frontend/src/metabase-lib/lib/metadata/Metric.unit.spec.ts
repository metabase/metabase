import { makeMetadata } from "__support__/sample_database_fixture";

import Metric from "metabase-lib/lib/metadata/Metric";
import Table from "metabase-lib/lib/metadata/Table";

import { createMockMetricInstance } from "metabase-lib/lib/mocks";

describe("Metric", () => {
  describe("Standard database", () => {
    const metricInstance = createMockMetricInstance();

    it("should be a Metric", () => {
      expect(metricInstance).toBeInstanceOf(Metric);
    });

    it("should have a Table", () => {
      expect(metricInstance.table).toBeInstanceOf(Table);
    });

    describe("displayName", () => {
      it("should return the metric name", () => {
        expect(metricInstance.displayName()).toBe("Avg of Product Rating");
      });
    });
    describe("aggregationClause", () => {
      it('should return ["metric", 1]', () => {
        expect(metricInstance.aggregationClause()).toEqual(["metric", 1]);
      });
    });
    describe("columnName", () => {
      it("should return the underlying metric definition name", () => {
        expect(metricInstance.columnName()).toBe("avg");
      });
    });
  });

  describe("Google Analytics database", () => {
    const gaMetricInstance = createMockMetricInstance({
      id: "ga:users",
      definition: {
        "source-table": 1,
      },
    });

    describe("displayName", () => {
      it("should return the metric name", () => {
        expect(gaMetricInstance.displayName()).toBe("Avg of Product Rating");
      });
    });

    describe("aggregationClause", () => {
      it('should return ["metric", "ga:users]', () => {
        expect(gaMetricInstance.aggregationClause()).toEqual([
          "metric",
          "ga:users",
        ]);
      });
    });

    describe("columnName", () => {
      it("should return the metric aggregation name when there is an aggregation", () => {
        expect(
          createMockMetricInstance({
            id: "ga:users",
          }).columnName(),
        ).toBe("avg");
      });

      it("should return the metric id when there is no aggregation", () => {
        expect(gaMetricInstance.columnName()).toBe("ga:users");
      });
    });
  });
});

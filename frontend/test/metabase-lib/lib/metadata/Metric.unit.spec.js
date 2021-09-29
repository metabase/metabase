import { metadata, makeMetadata } from "__support__/sample_dataset_fixture";

import Metric from "metabase-lib/lib/metadata/Metric";
import Table from "metabase-lib/lib/metadata/Table";

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

  describe("Google Analytics database", () => {
    const metadata = makeMetadata({
      metrics: { "ga:users": { name: "Users" } },
    });
    const metric = metadata.metric("ga:users");
    describe("displayName", () => {
      it("should return the metric name", () => {
        expect(metric.displayName()).toBe("Users");
      });
    });
    describe("aggregationClause", () => {
      it('should return ["metric", "ga:users]', () => {
        expect(metric.aggregationClause()).toEqual(["metric", "ga:users"]);
      });
    });
    describe("columnName", () => {
      it("should return the metric id", () => {
        expect(metric.columnName()).toBe("ga:users");
      });
    });
  });
});

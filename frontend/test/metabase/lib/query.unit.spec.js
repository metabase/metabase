import Utils from "metabase/lib/utils";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks";
import * as Q_DEPRECATED from "metabase-lib/queries/utils";

describe("Legacy Q_DEPRECATED library", () => {
  describe("createQuery", () => {
    it("should provide a structured query with no args", () => {
      expect(Q_DEPRECATED.createQuery()).toEqual({
        database: null,
        type: "query",
        query: {
          "source-table": null,
        },
      });
    });

    it("should be able to create a native type query", () => {
      expect(Q_DEPRECATED.createQuery("native")).toEqual({
        database: null,
        type: "native",
        native: {
          query: "",
        },
      });
    });

    it("should populate the databaseId if specified", () => {
      expect(Q_DEPRECATED.createQuery("query", 123).database).toEqual(123);
    });

    it("should populate the tableId if specified", () => {
      expect(
        Q_DEPRECATED.createQuery("query", 123, 456).query["source-table"],
      ).toEqual(456);
    });

    it("should NOT set the tableId if query type is native", () => {
      expect(Q_DEPRECATED.createQuery("native", 123, 456).query).toEqual(
        undefined,
      );
    });

    it("should NOT populate the tableId if no database specified", () => {
      expect(
        Q_DEPRECATED.createQuery("query", null, 456).query["source-table"],
      ).toEqual(null);
    });
  });

  describe("cleanQuery", () => {
    it("should pass for a query created with metabase-lib", () => {
      const datasetQuery = createMockStructuredDatasetQuery({
        query: {
          "source-table": 1,
          aggregation: [["count"]],
        },
      });

      // We have to take a copy because the original object isn't extensible
      const copiedDatasetQuery = Utils.copy(datasetQuery);
      Q_DEPRECATED.cleanQuery(copiedDatasetQuery);

      expect(copiedDatasetQuery).toBeDefined();
    });
    it("should not remove complete sort clauses", () => {
      const query = {
        "source-table": 0,
        "order-by": [["asc", ["field", 1, null]]],
      };
      Q_DEPRECATED.cleanQuery(query);
      expect(query["order-by"]).toEqual([["asc", ["field", 1, null]]]);
    });
    it("should remove incomplete sort clauses", () => {
      const query = {
        "source-table": 0,
        "order-by": [["asc", null]],
      };
      Q_DEPRECATED.cleanQuery(query);
      expect(query["order-by"]).toEqual(undefined);
    });

    it("should not remove sort clauses on aggregations if that aggregation supports it", () => {
      const query = {
        "source-table": 0,
        aggregation: [["count"]],
        breakout: [["field", 1, null]],
        "order-by": [["asc", ["aggregation", 0]]],
      };
      Q_DEPRECATED.cleanQuery(query);
      expect(query["order-by"]).toEqual([["asc", ["aggregation", 0]]]);
    });
    it("should remove sort clauses on aggregations if that aggregation doesn't support it", () => {
      const query = {
        "source-table": 0,
        "order-by": [["asc", ["aggregation", 0]]],
      };
      Q_DEPRECATED.cleanQuery(query);
      expect(query["order-by"]).toEqual(undefined);
    });

    it("should not remove sort clauses on fields appearing in breakout", () => {
      const query = {
        "source-table": 0,
        aggregation: [["count"]],
        breakout: [["field", 1, null]],
        "order-by": [["asc", ["field", 1, null]]],
      };
      Q_DEPRECATED.cleanQuery(query);
      expect(query["order-by"]).toEqual([["asc", ["field", 1, null]]]);
    });
    it("should remove sort clauses on fields not appearing in breakout", () => {
      const query = {
        "source-table": 0,
        aggregation: [["count"]],
        "order-by": [["asc", ["field", 1, null]]],
      };
      Q_DEPRECATED.cleanQuery(query);
      expect(query["order-by"]).toEqual(undefined);
    });

    it("should not remove sort clauses with foreign keys on fields appearing in breakout", () => {
      const query = {
        "source-table": 0,
        aggregation: [["count"]],
        breakout: [["field", 2, { "source-field": 1 }]],
        "order-by": [["asc", ["field", 2, { "source-field": 1 }]]],
      };
      Q_DEPRECATED.cleanQuery(query);
      expect(query["order-by"]).toEqual([
        ["asc", ["field", 2, { "source-field": 1 }]],
      ]);
    });

    it("should not remove sort clauses with datetime-fields on fields appearing in breakout", () => {
      const query = {
        "source-table": 0,
        aggregation: [["count"]],
        breakout: [["field", 1, { "temporal-unit": "week" }]],
        "order-by": [["asc", ["field", 1, { "temporal-unit": "week" }]]],
      };
      Q_DEPRECATED.cleanQuery(query);
      expect(query["order-by"]).toEqual([
        ["asc", ["field", 1, { "temporal-unit": "week" }]],
      ]);
    });

    it("should replace order-by clauses with the exact matching datetime-fields version in the breakout", () => {
      const query = {
        "source-table": 0,
        aggregation: [["count"]],
        breakout: [["field", 1, { "temporal-unit": "week" }]],
        "order-by": [["asc", ["field", 1, null]]],
      };
      Q_DEPRECATED.cleanQuery(query);
      expect(query["order-by"]).toEqual([
        ["asc", ["field", 1, { "temporal-unit": "week" }]],
      ]);
    });

    it("should replace order-by clauses with the exact matching fk version in the breakout", () => {
      const query = {
        "source-table": 0,
        aggregation: [["count"]],
        breakout: [["field", 2, { "source-field": 1 }]],
        "order-by": [["asc", ["field", 2, null]]],
      };
      Q_DEPRECATED.cleanQuery(query);
      expect(query["order-by"]).toEqual([
        ["asc", ["field", 2, { "source-field": 1 }]],
      ]);
    });
  });
});

describe("isValidField", () => {
  it("should return true for new-style fk", () => {
    expect(Q_DEPRECATED.isValidField(["field", 2, { "source-field": 1 }])).toBe(
      true,
    );
  });
});

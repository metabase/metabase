import Query, {
  createQuery,
  AggregationClause,
  BreakoutClause,
} from "metabase/lib/query";
import { question } from "__support__/sample_dataset_fixture";
import Utils from "metabase/lib/utils";

const mockTableMetadata = {
  display_name: "Order",
  fields: [{ id: 1, display_name: "Total" }],
};

describe("Legacy Query library", () => {
  describe("createQuery", () => {
    it("should provide a structured query with no args", () => {
      expect(createQuery()).toEqual({
        database: null,
        type: "query",
        query: {
          "source-table": null,
        },
      });
    });

    it("should be able to create a native type query", () => {
      expect(createQuery("native")).toEqual({
        database: null,
        type: "native",
        native: {
          query: "",
        },
      });
    });

    it("should populate the databaseId if specified", () => {
      expect(createQuery("query", 123).database).toEqual(123);
    });

    it("should populate the tableId if specified", () => {
      expect(createQuery("query", 123, 456).query["source-table"]).toEqual(456);
    });

    it("should NOT set the tableId if query type is native", () => {
      expect(createQuery("native", 123, 456).query).toEqual(undefined);
    });

    it("should NOT populate the tableId if no database specified", () => {
      expect(createQuery("query", null, 456).query["source-table"]).toEqual(
        null,
      );
    });
  });

  describe("cleanQuery", () => {
    it("should pass for a query created with metabase-lib", () => {
      const datasetQuery = question
        .query()
        .addAggregation(["count"])
        .datasetQuery();

      // We have to take a copy because the original object isn't extensible
      const copiedDatasetQuery = Utils.copy(datasetQuery);
      Query.cleanQuery(copiedDatasetQuery);

      expect(copiedDatasetQuery).toBeDefined();
    });
    it("should not remove complete sort clauses", () => {
      let query = {
        "source-table": 0,
        aggregation: ["rows"],
        breakout: [],
        filter: [],
        "order-by": [["asc", 1]],
      };
      Query.cleanQuery(query);
      expect(query["order-by"]).toEqual([["asc", 1]]);
    });
    it("should remove incomplete sort clauses", () => {
      let query = {
        "source-table": 0,
        aggregation: ["rows"],
        breakout: [],
        filter: [],
        "order-by": [["asc", null]],
      };
      Query.cleanQuery(query);
      expect(query["order-by"]).toEqual(undefined);
    });

    it("should not remove sort clauses on aggregations if that aggregation supports it", () => {
      let query = {
        "source-table": 0,
        aggregation: ["count"],
        breakout: [1],
        filter: [],
        "order-by": [["asc", ["aggregation", 0]]],
      };
      Query.cleanQuery(query);
      expect(query["order-by"]).toEqual([["asc", ["aggregation", 0]]]);
    });
    it("should remove sort clauses on aggregations if that aggregation doesn't support it", () => {
      let query = {
        "source-table": 0,
        aggregation: ["rows"],
        breakout: [],
        filter: [],
        "order-by": [["asc", ["aggregation", 0]]],
      };
      Query.cleanQuery(query);
      expect(query["order-by"]).toEqual(undefined);
    });

    it("should not remove sort clauses on fields appearing in breakout", () => {
      let query = {
        "source-table": 0,
        aggregation: ["count"],
        breakout: [1],
        filter: [],
        "order-by": [["asc", 1]],
      };
      Query.cleanQuery(query);
      expect(query["order-by"]).toEqual([["asc", 1]]);
    });
    it("should remove sort clauses on fields not appearing in breakout", () => {
      let query = {
        "source-table": 0,
        aggregation: ["count"],
        breakout: [],
        filter: [],
        "order-by": [["asc", 1]],
      };
      Query.cleanQuery(query);
      expect(query["order-by"]).toEqual(undefined);
    });

    it("should not remove sort clauses with foreign keys on fields appearing in breakout", () => {
      let query = {
        "source-table": 0,
        aggregation: ["count"],
        breakout: [["fk->", 1, 2]],
        filter: [],
        "order-by": [["asc", ["fk->", 1, 2]]],
      };
      Query.cleanQuery(query);
      expect(query["order-by"]).toEqual([["asc", ["fk->", 1, 2]]]);
    });

    it("should not remove sort clauses with datetime-fields on fields appearing in breakout", () => {
      let query = {
        "source-table": 0,
        aggregation: ["count"],
        breakout: [["datetime-field", 1, "as", "week"]],
        filter: [],
        "order-by": [["asc", ["datetime-field", 1, "as", "week"]]],
      };
      Query.cleanQuery(query);
      expect(query["order-by"]).toEqual([
        ["asc", ["datetime-field", 1, "as", "week"]],
      ]);
    });

    it("should replace order-by clauses with the exact matching datetime-fields version in the breakout", () => {
      let query = {
        "source-table": 0,
        aggregation: ["count"],
        breakout: [["datetime-field", 1, "as", "week"]],
        filter: [],
        "order-by": [["asc", 1]],
      };
      Query.cleanQuery(query);
      expect(query["order-by"]).toEqual([
        ["asc", ["datetime-field", 1, "as", "week"]],
      ]);
    });

    it("should replace order-by clauses with the exact matching fk-> version in the breakout", () => {
      let query = {
        "source-table": 0,
        aggregation: ["count"],
        breakout: [["fk->", 1, 2]],
        filter: [],
        "order-by": [["asc", 2]],
      };
      Query.cleanQuery(query);
      expect(query["order-by"]).toEqual([["asc", ["fk->", 1, 2]]]);
    });
  });

  describe("removeBreakout", () => {
    it("should not mutate the query", () => {
      let query = {
        "source-table": 0,
        aggregation: ["count"],
        breakout: [["field-id", 1]],
        filter: [],
      };
      Query.removeBreakout(query, 0);
      expect(query.breakout).toEqual([["field-id", 1]]);
    });
    it("should remove the dimension", () => {
      let query = {
        "source-table": 0,
        aggregation: ["count"],
        breakout: [["field-id", 1]],
        filter: [],
      };
      query = Query.removeBreakout(query, 0);
      expect(query.breakout).toEqual(undefined);
    });
    it("should remove sort clauses for the dimension that was removed", () => {
      let query = {
        "source-table": 0,
        aggregation: ["count"],
        breakout: [["field-id", 1]],
        filter: [],
        "order-by": [["asc", 1]],
      };
      query = Query.removeBreakout(query, 0);
      expect(query["order-by"]).toEqual(undefined);
    });
  });

  describe("getFieldTarget", () => {
    let field2 = {
      display_name: "field2",
    };
    let table2 = {
      display_name: "table2",
      fields_lookup: {
        2: field2,
      },
    };
    let field1 = {
      display_name: "field1",
      target: {
        table: table2,
      },
    };
    let table1 = {
      display_name: "table1",
      fields_lookup: {
        1: field1,
      },
    };

    it("should return field object for old-style local field", () => {
      let target = Query.getFieldTarget(1, table1);
      expect(target.table).toEqual(table1);
      expect(target.field).toEqual(field1);
      expect(target.path).toEqual([]);
      expect(target.unit).toEqual(undefined);
    });
    it("should return field object for new-style local field", () => {
      let target = Query.getFieldTarget(["field-id", 1], table1);
      expect(target.table).toEqual(table1);
      expect(target.field).toEqual(field1);
      expect(target.path).toEqual([]);
      expect(target.unit).toEqual(undefined);
    });
    it("should return unit object for old-style datetime-field", () => {
      let target = Query.getFieldTarget(
        ["datetime-field", 1, "as", "day"],
        table1,
      );
      expect(target.table).toEqual(table1);
      expect(target.field).toEqual(field1);
      expect(target.path).toEqual([]);
      expect(target.unit).toEqual("day");
    });
    it("should return unit object for new-style datetime-field", () => {
      let target = Query.getFieldTarget(
        ["datetime-field", 1, "as", "day"],
        table1,
      );
      expect(target.table).toEqual(table1);
      expect(target.field).toEqual(field1);
      expect(target.path).toEqual([]);
      expect(target.unit).toEqual("day");
    });

    it("should return field object and table for old-style fk field", () => {
      let target = Query.getFieldTarget(["fk->", 1, 2], table1);
      expect(target.table).toEqual(table2);
      expect(target.field).toEqual(field2);
      expect(target.path).toEqual([field1]);
      expect(target.unit).toEqual(undefined);
    });

    it("should return field object and table for new-style fk field", () => {
      let target = Query.getFieldTarget(
        ["fk->", ["field-id", 1], ["field-id", 2]],
        table1,
      );
      expect(target.table).toEqual(table2);
      expect(target.field).toEqual(field2);
      expect(target.path).toEqual([field1]);
      expect(target.unit).toEqual(undefined);
    });

    it("should return field object and table and unit for fk + datetime field", () => {
      let target = Query.getFieldTarget(
        ["datetime-field", ["fk->", 1, 2], "day"],
        table1,
      );
      expect(target.table).toEqual(table2);
      expect(target.field).toEqual(field2);
      expect(target.path).toEqual([field1]);
      expect(target.unit).toEqual("day");
    });

    it("should return field object and table for expression", () => {
      let target = Query.getFieldTarget(["expression", "foo"], table1);
      expect(target.table).toEqual(table1);
      expect(target.field.display_name).toEqual("foo");
      expect(target.path).toEqual([]);
      expect(target.unit).toEqual(undefined);
    });
  });
});

describe("isValidField", () => {
  it("should return true for old-style fk", () => {
    expect(Query.isValidField(["fk->", 1, 2])).toBe(true);
  });
  it("should return true for new-style fk", () => {
    expect(Query.isValidField(["fk->", ["field-id", 1], ["field-id", 2]])).toBe(
      true,
    );
  });
});

describe("generateQueryDescription", () => {
  it("should work with multiple aggregations", () => {
    expect(
      Query.generateQueryDescription(mockTableMetadata, {
        "source-table": 1,
        aggregation: [["count"], ["sum", ["field-id", 1]]],
      }),
    ).toEqual("Orders, Count and Sum of Total");
  });
  it("should work with named aggregations", () => {
    expect(
      Query.generateQueryDescription(mockTableMetadata, {
        "source-table": 1,
        aggregation: [["named", ["sum", ["field-id", 1]], "Revenue"]],
      }),
    ).toEqual("Orders, Revenue");
  });
});

describe("AggregationClause", () => {
  describe("isValid", () => {
    it("should fail on bad clauses", () => {
      expect(AggregationClause.isValid(undefined)).toEqual(false);
      expect(AggregationClause.isValid(null)).toEqual(false);
      expect(AggregationClause.isValid([])).toEqual(false);
      expect(AggregationClause.isValid([null])).toEqual(false);
      expect(AggregationClause.isValid("ab")).toEqual(false);
      expect(AggregationClause.isValid(["foo", null])).toEqual(false);
      expect(AggregationClause.isValid(["a", "b", "c"])).toEqual(false);
    });

    it("should succeed on good clauses", () => {
      expect(AggregationClause.isValid(["metric", 123])).toEqual(true);
      // TODO - actually this should be FALSE because rows is not a valid aggregation type!
      expect(AggregationClause.isValid(["rows"])).toEqual(true);
      expect(AggregationClause.isValid(["sum", 456])).toEqual(true);
    });
  });

  describe("isBareRows", () => {
    it("should fail on bad clauses", () => {
      expect(AggregationClause.isBareRows(undefined)).toEqual(false);
      expect(AggregationClause.isBareRows(null)).toEqual(false);
      expect(AggregationClause.isBareRows([])).toEqual(false);
      expect(AggregationClause.isBareRows([null])).toEqual(false);
      expect(AggregationClause.isBareRows("ab")).toEqual(false);
      expect(AggregationClause.isBareRows(["foo", null])).toEqual(false);
      expect(AggregationClause.isBareRows(["a", "b", "c"])).toEqual(false);
      expect(AggregationClause.isBareRows(["metric", 123])).toEqual(false);
      expect(AggregationClause.isBareRows(["sum", 456])).toEqual(false);
    });

    it("should succeed on good clauses", () => {
      expect(AggregationClause.isBareRows(["rows"])).toEqual(true);
    });
  });

  describe("isStandard", () => {
    it("should fail on bad clauses", () => {
      expect(AggregationClause.isStandard(undefined)).toEqual(false);
      expect(AggregationClause.isStandard(null)).toEqual(false);
      expect(AggregationClause.isStandard([])).toEqual(false);
      expect(AggregationClause.isStandard([null])).toEqual(false);
      expect(AggregationClause.isStandard("ab")).toEqual(false);
      expect(AggregationClause.isStandard(["foo", null])).toEqual(false);
      expect(AggregationClause.isStandard(["a", "b", "c"])).toEqual(false);
      expect(AggregationClause.isStandard(["metric", 123])).toEqual(false);
    });

    it("should succeed on good clauses", () => {
      expect(AggregationClause.isStandard(["rows"])).toEqual(true);
      expect(AggregationClause.isStandard(["sum", 456])).toEqual(true);
    });
  });

  describe("isMetric", () => {
    it("should fail on bad clauses", () => {
      expect(AggregationClause.isMetric(undefined)).toEqual(false);
      expect(AggregationClause.isMetric(null)).toEqual(false);
      expect(AggregationClause.isMetric([])).toEqual(false);
      expect(AggregationClause.isMetric([null])).toEqual(false);
      expect(AggregationClause.isMetric("ab")).toEqual(false);
      expect(AggregationClause.isMetric(["foo", null])).toEqual(false);
      expect(AggregationClause.isMetric(["a", "b", "c"])).toEqual(false);
      expect(AggregationClause.isMetric(["rows"])).toEqual(false);
      expect(AggregationClause.isMetric(["sum", 456])).toEqual(false);
    });

    it("should succeed on good clauses", () => {
      expect(AggregationClause.isMetric(["metric", 123])).toEqual(true);
    });
  });

  describe("getMetric", () => {
    it("should succeed on good clauses", () => {
      expect(AggregationClause.getMetric(["metric", 123])).toEqual(123);
    });

    it("should be null on non-metric clauses", () => {
      expect(AggregationClause.getMetric(["sum", 123])).toEqual(null);
    });
  });

  describe("getOperator", () => {
    it("should succeed on good clauses", () => {
      expect(AggregationClause.getOperator(["rows"])).toEqual("rows");
      expect(AggregationClause.getOperator(["sum", 123])).toEqual("sum");
    });

    it("should be null on metric clauses", () => {
      expect(AggregationClause.getOperator(["metric", 123])).toEqual(null);
    });
  });

  describe("getField", () => {
    it("should succeed on good clauses", () => {
      expect(AggregationClause.getField(["sum", 123])).toEqual(123);
    });

    it("should be null on clauses w/out a field", () => {
      expect(AggregationClause.getField(["rows"])).toEqual(null);
    });

    it("should be null on metric clauses", () => {
      expect(AggregationClause.getField(["metric", 123])).toEqual(null);
    });
  });

  describe("setField", () => {
    it("should succeed on good clauses", () => {
      expect(AggregationClause.setField(["avg"], 123)).toEqual(["avg", 123]);
      expect(AggregationClause.setField(["sum", null], 123)).toEqual([
        "sum",
        123,
      ]);
    });

    it("should return unmodified on metric clauses", () => {
      expect(AggregationClause.setField(["metric", 123], 456)).toEqual([
        "metric",
        123,
      ]);
    });
  });
});

describe("BreakoutClause", () => {
  describe("setBreakout", () => {
    it("should append if index is greater than current breakouts", () => {
      expect(BreakoutClause.setBreakout([], 0, 123)).toEqual([123]);
      expect(BreakoutClause.setBreakout([123], 1, 456)).toEqual([123, 456]);
      expect(BreakoutClause.setBreakout([123], 5, 456)).toEqual([123, 456]);
    });

    it("should replace if index already exists", () => {
      expect(BreakoutClause.setBreakout([123], 0, 456)).toEqual([456]);
    });
  });

  describe("removeBreakout", () => {
    it("should remove breakout if index exists", () => {
      expect(BreakoutClause.removeBreakout([123], 0)).toEqual([]);
      expect(BreakoutClause.removeBreakout([123, 456], 1)).toEqual([123]);
    });

    it("should make no changes if index does not exist", () => {
      expect(BreakoutClause.removeBreakout([123], 1)).toEqual([123]);
    });
  });
});

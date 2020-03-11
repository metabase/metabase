import * as Q_DEPRECATED from "metabase/lib/query";
import * as A_DEPRECATED from "metabase/lib/query_aggregation";

import { ORDERS } from "__support__/sample_dataset_fixture";
import Utils from "metabase/lib/utils";

const mockTableMetadata = {
  display_name: "Order",
  fields: [{ id: 1, display_name: "Total" }],
};

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
      const datasetQuery = ORDERS.query()
        .aggregate(["count"])
        .datasetQuery();

      // We have to take a copy because the original object isn't extensible
      const copiedDatasetQuery = Utils.copy(datasetQuery);
      Q_DEPRECATED.cleanQuery(copiedDatasetQuery);

      expect(copiedDatasetQuery).toBeDefined();
    });
    it("should not remove complete sort clauses", () => {
      const query = {
        "source-table": 0,
        "order-by": [["asc", ["field-id", 1]]],
      };
      Q_DEPRECATED.cleanQuery(query);
      expect(query["order-by"]).toEqual([["asc", ["field-id", 1]]]);
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
        breakout: [["field-id", 1]],
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
        breakout: [["field-id", 1]],
        "order-by": [["asc", ["field-id", 1]]],
      };
      Q_DEPRECATED.cleanQuery(query);
      expect(query["order-by"]).toEqual([["asc", ["field-id", 1]]]);
    });
    it("should remove sort clauses on fields not appearing in breakout", () => {
      const query = {
        "source-table": 0,
        aggregation: [["count"]],
        "order-by": [["asc", ["field-id", 1]]],
      };
      Q_DEPRECATED.cleanQuery(query);
      expect(query["order-by"]).toEqual(undefined);
    });

    it("should not remove sort clauses with foreign keys on fields appearing in breakout", () => {
      const query = {
        "source-table": 0,
        aggregation: [["count"]],
        breakout: [["fk->", ["field-id", 1], ["field-id", 2]]],
        "order-by": [["asc", ["fk->", ["field-id", 1], ["field-id", 2]]]],
      };
      Q_DEPRECATED.cleanQuery(query);
      expect(query["order-by"]).toEqual([
        ["asc", ["fk->", ["field-id", 1], ["field-id", 2]]],
      ]);
    });

    it("should not remove sort clauses with datetime-fields on fields appearing in breakout", () => {
      const query = {
        "source-table": 0,
        aggregation: [["count"]],
        breakout: [["datetime-field", ["field-id", 1], "week"]],
        "order-by": [["asc", ["datetime-field", ["field-id", 1], "week"]]],
      };
      Q_DEPRECATED.cleanQuery(query);
      expect(query["order-by"]).toEqual([
        ["asc", ["datetime-field", ["field-id", 1], "week"]],
      ]);
    });

    it("should replace order-by clauses with the exact matching datetime-fields version in the breakout", () => {
      const query = {
        "source-table": 0,
        aggregation: [["count"]],
        breakout: [["datetime-field", ["field-id", 1], "week"]],
        "order-by": [["asc", ["field-id", 1]]],
      };
      Q_DEPRECATED.cleanQuery(query);
      expect(query["order-by"]).toEqual([
        ["asc", ["datetime-field", ["field-id", 1], "week"]],
      ]);
    });

    it("should replace order-by clauses with the exact matching fk-> version in the breakout", () => {
      const query = {
        "source-table": 0,
        aggregation: [["count"]],
        breakout: [["fk->", ["field-id", 1], ["field-id", 2]]],
        "order-by": [["asc", ["field-id", 2]]],
      };
      Q_DEPRECATED.cleanQuery(query);
      expect(query["order-by"]).toEqual([
        ["asc", ["fk->", ["field-id", 1], ["field-id", 2]]],
      ]);
    });
  });

  describe("removeBreakout", () => {
    it("should not mutate the query", () => {
      const query = {
        "source-table": 0,
        aggregation: [["count"]],
        breakout: [["field-id", 1]],
      };
      Q_DEPRECATED.removeBreakout(query, 0);
      expect(query.breakout).toEqual([["field-id", 1]]);
    });
    it("should remove the dimension", () => {
      let query = {
        "source-table": 0,
        aggregation: [["count"]],
        breakout: [["field-id", 1]],
      };
      query = Q_DEPRECATED.removeBreakout(query, 0);
      expect(query.breakout).toEqual(undefined);
    });
    it("should remove sort clauses for the dimension that was removed", () => {
      let query = {
        "source-table": 0,
        aggregation: [["count"]],
        breakout: [["field-id", 1]],
        "order-by": [["asc", ["field-id", 1]]],
      };
      query = Q_DEPRECATED.removeBreakout(query, 0);
      expect(query["order-by"]).toEqual(undefined);
    });
  });

  describe("getFieldTarget", () => {
    const field2 = {
      display_name: "field2",
    };
    const table2 = {
      display_name: "table2",
      fields_lookup: {
        2: field2,
      },
    };
    const field1 = {
      display_name: "field1",
      target: {
        table: table2,
      },
    };
    const table1 = {
      display_name: "table1",
      fields_lookup: {
        1: field1,
      },
    };

    it("should return field object for old-style local field", () => {
      const target = Q_DEPRECATED.getFieldTarget(1, table1);
      expect(target.table).toEqual(table1);
      expect(target.field).toEqual(field1);
      expect(target.path).toEqual([]);
      expect(target.unit).toEqual(undefined);
    });
    it("should return field object for new-style local field", () => {
      const target = Q_DEPRECATED.getFieldTarget(["field-id", 1], table1);
      expect(target.table).toEqual(table1);
      expect(target.field).toEqual(field1);
      expect(target.path).toEqual([]);
      expect(target.unit).toEqual(undefined);
    });
    it("should return unit object for old-style datetime-field", () => {
      const target = Q_DEPRECATED.getFieldTarget(
        ["datetime-field", ["field-id", 1], "day"],
        table1,
      );
      expect(target.table).toEqual(table1);
      expect(target.field).toEqual(field1);
      expect(target.path).toEqual([]);
      expect(target.unit).toEqual("day");
    });
    it("should return unit object for new-style datetime-field", () => {
      const target = Q_DEPRECATED.getFieldTarget(
        ["datetime-field", ["field-id", 1], "day"],
        table1,
      );
      expect(target.table).toEqual(table1);
      expect(target.field).toEqual(field1);
      expect(target.path).toEqual([]);
      expect(target.unit).toEqual("day");
    });

    it("should return field object and table for old-style fk field", () => {
      const target = Q_DEPRECATED.getFieldTarget(
        ["fk->", ["field-id", 1], ["field-id", 2]],
        table1,
      );
      expect(target.table).toEqual(table2);
      expect(target.field).toEqual(field2);
      expect(target.path).toEqual([field1]);
      expect(target.unit).toEqual(undefined);
    });

    it("should return field object and table for new-style fk field", () => {
      const target = Q_DEPRECATED.getFieldTarget(
        ["fk->", ["field-id", 1], ["field-id", 2]],
        table1,
      );
      expect(target.table).toEqual(table2);
      expect(target.field).toEqual(field2);
      expect(target.path).toEqual([field1]);
      expect(target.unit).toEqual(undefined);
    });

    it("should return field object and table and unit for fk + datetime field", () => {
      const target = Q_DEPRECATED.getFieldTarget(
        ["datetime-field", ["fk->", ["field-id", 1], ["field-id", 2]], "day"],
        table1,
      );
      expect(target.table).toEqual(table2);
      expect(target.field).toEqual(field2);
      expect(target.path).toEqual([field1]);
      expect(target.unit).toEqual("day");
    });

    it("should return field object and table for expression", () => {
      const target = Q_DEPRECATED.getFieldTarget(["expression", "foo"], table1);
      expect(target.table).toEqual(table1);
      expect(target.field.display_name).toEqual("foo");
      expect(target.path).toEqual([]);
      expect(target.unit).toEqual(undefined);
      expect(target.field.constructor.name).toEqual("Field");
    });
  });
});

describe("isValidField", () => {
  it("should return true for old-style fk", () => {
    expect(
      Q_DEPRECATED.isValidField(["fk->", ["field-id", 1], ["field-id", 2]]),
    ).toBe(true);
  });
  it("should return true for new-style fk", () => {
    expect(
      Q_DEPRECATED.isValidField(["fk->", ["field-id", 1], ["field-id", 2]]),
    ).toBe(true);
  });
});

describe("generateQueryDescription", () => {
  it("should work with multiple aggregations", () => {
    expect(
      Q_DEPRECATED.generateQueryDescription(mockTableMetadata, {
        "source-table": ORDERS.id,
        aggregation: [["count"], ["sum", ["field-id", 1]]],
      }),
    ).toEqual("Orders, Count and Sum of Total");
  });
  it("should work with named aggregations", () => {
    expect(
      Q_DEPRECATED.generateQueryDescription(mockTableMetadata, {
        "source-table": ORDERS.id,
        aggregation: [
          [
            "aggregation-options",
            ["sum", ["field-id", 1]],
            { "display-name": "Revenue" },
          ],
        ],
      }),
    ).toEqual("Orders, Revenue");
  });
});

describe("AggregationClause", () => {
  const cases = [
    [null, undefined],
    [null, null],
    [null, []],
    [null, [null]],
    [null, "ab"],
    [null, ["foo", null]],
    ["metric", ["metric", 123]],
    ["standard", ["sum", ["field-id", 1]]],
    ["standard", ["count"]],
    ["custom", ["sum-where", ["field-id"]]],
    ["custom", ["aggregation-options", ["count"], { "display-name": "foo" }]],
  ];
  describe("isStandard", () => {
    for (const [type, clause] of cases) {
      const expected = type === "standard";
      it(`should return ${expected} for ${JSON.stringify(clause)}`, () => {
        expect(A_DEPRECATED.isStandard(clause)).toBe(expected);
      });
    }
  });

  describe("isCustom", () => {
    for (const [type, clause] of cases) {
      const expected = type === "custom";
      it(`should return ${expected} for ${JSON.stringify(clause)}`, () => {
        expect(A_DEPRECATED.isCustom(clause)).toBe(expected);
      });
    }
  });

  describe("isMetric", () => {
    for (const [type, clause] of cases) {
      const expected = type === "metric";
      it(`should return ${expected} for ${JSON.stringify(clause)}`, () => {
        expect(A_DEPRECATED.isMetric(clause)).toBe(expected);
      });
    }
  });

  describe("isValid", () => {
    for (const [type, clause] of cases) {
      const expected = !(type === null);
      it(`should return ${expected} for ${JSON.stringify(clause)}`, () => {
        expect(A_DEPRECATED.isValid(clause)).toBe(expected);
      });
    }
  });

  describe("getMetric", () => {
    it("should succeed on good clauses", () => {
      expect(A_DEPRECATED.getMetric(["metric", 123])).toEqual(123);
    });

    it("should be null on non-metric clauses", () => {
      expect(A_DEPRECATED.getMetric(["sum", 123])).toEqual(null);
    });
  });

  describe("getOperator", () => {
    it("should succeed on good clauses", () => {
      expect(A_DEPRECATED.getOperator(["rows"])).toEqual("rows"); // deprecated
      expect(A_DEPRECATED.getOperator(["sum", 123])).toEqual("sum");
    });

    it("should be null on metric clauses", () => {
      expect(A_DEPRECATED.getOperator(["metric", 123])).toEqual(null);
    });
  });

  describe("getField", () => {
    it("should succeed on good clauses", () => {
      expect(A_DEPRECATED.getField(["sum", 123])).toEqual(123);
    });

    it("should be null on clauses w/out a field", () => {
      expect(A_DEPRECATED.getField(["rows"])).toEqual(null); // deprecated
    });

    it("should be null on metric clauses", () => {
      expect(A_DEPRECATED.getField(["metric", 123])).toEqual(null);
    });
  });

  describe("setField", () => {
    it("should succeed on good clauses", () => {
      expect(A_DEPRECATED.setField(["avg"], 123)).toEqual(["avg", 123]);
      expect(A_DEPRECATED.setField(["sum", null], 123)).toEqual(["sum", 123]);
    });

    it("should return unmodified on metric clauses", () => {
      expect(A_DEPRECATED.setField(["metric", 123], 456)).toEqual([
        "metric",
        123,
      ]);
    });
  });
});

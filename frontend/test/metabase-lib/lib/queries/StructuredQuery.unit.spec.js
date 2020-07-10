import {
  SAMPLE_DATASET,
  ANOTHER_DATABASE,
  ORDERS,
  PRODUCTS,
  MAIN_METRIC_ID,
} from "__support__/sample_dataset_fixture";

import Segment from "metabase-lib/lib/metadata/Segment";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

function makeDatasetQuery(query = {}) {
  return {
    type: "query",
    database: SAMPLE_DATASET.id,
    query: {
      "source-table": query["source-query"] ? undefined : ORDERS.id,
      ...query,
    },
  };
}

function makeQuery(query) {
  return new StructuredQuery(ORDERS.question(), makeDatasetQuery(query));
}

function makeQueryWithAggregation(agg) {
  return makeQuery({ aggregation: [agg] });
}

const query = makeQuery({});

describe("StructuredQuery behavioral tests", () => {
  it("is able to filter by field which is already used for the query breakout", () => {
    const breakoutDimensionOptions = query.breakoutOptions().dimensions;
    const breakoutDimension = breakoutDimensionOptions.find(
      d => d.field().id === ORDERS.TOTAL.id,
    );

    expect(breakoutDimension).toBeDefined();

    const queryWithBreakout = query.breakout(breakoutDimension.mbql());

    const filterDimensionOptions = queryWithBreakout.filterDimensionOptions()
      .dimensions;
    const filterDimension = filterDimensionOptions.find(
      d => d.field().id === ORDERS.TOTAL.id,
    );

    expect(filterDimension).toBeDefined();
  });
});

describe("StructuredQuery", () => {
  describe("DB METADATA METHODS", () => {
    describe("tables", () => {
      it("Tables should return multiple tables", () => {
        expect(Array.isArray(query.tables())).toBe(true);
      });
      it("Tables should return a table map that includes fields", () => {
        expect(Array.isArray(query.tables()[0].fields)).toBe(true);
      });
    });
    describe("table", () => {
      it("Return the table wrapper object for the query", () => {
        expect(query.table()).toBe(ORDERS);
      });
    });
    describe("databaseId", () => {
      it("returns the Database ID of the wrapped query ", () => {
        expect(query.databaseId()).toBe(SAMPLE_DATASET.id);
      });
    });
    describe("database", () => {
      it("returns a dictionary with the underlying database of the wrapped query", () => {
        expect(query.database().id).toBe(SAMPLE_DATASET.id);
      });
    });
    describe("engine", () => {
      it("identifies the engine of a query", () => {
        // This is a magic constant and we should probably pull this up into an enum
        expect(query.engine()).toBe("h2");
      });
    });
    describe("dependentMetadata", () => {
      it("should include source table with foreignTables = true", () => {
        expect(query.dependentMetadata()).toEqual([
          { type: "table", id: ORDERS.id, foreignTables: true },
        ]);
      });
      it("should include source table for nested queries with foreignTables = true", () => {
        expect(query.nest().dependentMetadata()).toEqual([
          { type: "table", id: ORDERS.id, foreignTables: true },
        ]);
      });
      it("should include joined tables with foreignTables = false", () => {
        expect(
          query
            .join({
              alias: "x",
              "source-table": PRODUCTS.id,
            })
            .dependentMetadata(),
        ).toEqual([
          { type: "table", id: ORDERS.id, foreignTables: true },
          { type: "table", id: PRODUCTS.id, foreignTables: false },
        ]);
      });
    });
  });

  describe("SIMPLE QUERY MANIPULATION METHODS", () => {
    describe("reset", () => {
      it("Expect a reset query to not have a selected database", () => {
        expect(query.reset().database()).toBe(null);
      });
      it("Expect a reset query to not be runnable", () => {
        expect(query.reset().canRun()).toBe(false);
      });
    });
    describe("query", () => {
      it("returns the wrapper for the query dictionary", () => {
        expect(query.query()["source-table"]).toBe(ORDERS.id);
      });
    });
    describe("setDatabase", () => {
      it("allows you to set a new database", () => {
        expect(query.setDatabase(ANOTHER_DATABASE).database().id).toBe(
          ANOTHER_DATABASE.id,
        );
      });
    });
    describe("setTable", () => {
      it("allows you to set a new table", () => {
        expect(query.setTable(PRODUCTS).tableId()).toBe(PRODUCTS.id);
      });

      it("retains the correct database id when setting a new table", () => {
        expect(query.setTable(PRODUCTS).table().database.id).toBe(
          SAMPLE_DATASET.id,
        );
      });
    });
    describe("tableId", () => {
      it("Return the right table id", () => {
        expect(query.tableId()).toBe(ORDERS.id);
      });
    });
  });

  describe("QUERY STATUS METHODS", () => {
    describe("canRun", () => {
      it("runs a valid query", () => {
        expect(query.canRun()).toBe(true);
      });
    });
    describe("isEditable", () => {
      it("A valid query should be editable", () => {
        expect(query.isEditable()).toBe(true);
      });
    });
    describe("isEmpty", () => {
      it("tells that a non-empty query is not empty", () => {
        expect(query.isEmpty()).toBe(false);
      });
    });
  });

  describe("AGGREGATION METHODS", () => {
    describe("aggregations", () => {
      it("should return an empty list for an empty query", () => {
        expect(query.aggregations().length).toBe(0);
      });
      it("should return a list of one item after adding an aggregation", () => {
        expect(query.aggregate(["count"]).aggregations().length).toBe(1);
      });
      it("should return an actual count aggregation after trying to add it", () => {
        expect(query.aggregate(["count"]).aggregations()[0][0]).toEqual(
          "count",
        );
      });
    });

    describe("aggregationOperators", () => {
      // TODO Atte Keinänen 6/14/17: Add the mock metadata for aggregation options
      // (currently the fixture doesn't include them)
      it("should return a non-empty list of options", () => {
        pending();
        expect(query.aggregationOperators().length).toBeGreaterThan(0);
      });
      it("should contain the count aggregation", () => {
        pending();
      });
    });
    describe("aggregationOperatorsWithoutRaw", () => {
      // Also waiting for the mock metadata
      pending();
    });

    describe("aggregationFieldOptions()", () => {
      it("includes expressions to the results without a field filter", () => {
        pending();
      });
      it("includes expressions to the results with a field filter", () => {
        pending();
      });
    });

    describe("canRemoveAggregation", () => {
      it("returns false if there are no aggregations", () => {
        expect(query.canRemoveAggregation()).toBe(false);
      });
      it("returns false for a single aggregation", () => {
        expect(query.aggregate(["count"]).canRemoveAggregation()).toBe(false);
      });
      it("returns true for two aggregations", () => {
        expect(
          query
            .aggregate(["count"])
            .aggregate(["sum", ["field-id", ORDERS.TOTAL.id]])
            .canRemoveAggregation(),
        ).toBe(true);
      });
    });

    describe("isBareRows", () => {
      it("is true for an empty query", () => {
        expect(query.isBareRows()).toBe(true);
      });
      it("is false for a count aggregation", () => {
        expect(query.aggregate(["count"]).isBareRows()).toBe(false);
      });
    });

    describe("aggregation name", () => {
      it("returns a saved metric's name", () => {
        expect(
          makeQueryWithAggregation(["metric", MAIN_METRIC_ID])
            .aggregations()[0]
            .displayName(),
        ).toBe("Total Order Value");
      });
      it("returns a standard aggregation name", () => {
        expect(
          makeQueryWithAggregation(["count"])
            .aggregations()[0]
            .displayName(),
        ).toBe("Count");
      });
      it("returns a standard aggregation name with field", () => {
        expect(
          makeQueryWithAggregation(["sum", ["field-id", ORDERS.TOTAL.id]])
            .aggregations()[0]
            .displayName(),
        ).toBe("Sum of Total");
      });
      it("returns a standard aggregation name with fk field", () => {
        expect(
          makeQueryWithAggregation([
            "sum",
            ["fk->", ORDERS.PRODUCT_ID.id, PRODUCTS.TITLE.id],
          ])
            .aggregations()[0]
            .displayName(),
        ).toBe("Sum of Product → Title");
      });
      it("returns a custom expression description", () => {
        expect(
          makeQueryWithAggregation([
            "+",
            1,
            ["sum", ["field-id", ORDERS.TOTAL.id]],
          ])
            .aggregations()[0]
            .displayName(),
        ).toBe("1 + Sum(Total)");
      });
      it("returns a named expression name", () => {
        expect(
          makeQueryWithAggregation([
            "aggregation-options",
            ["sum", ["field-id", ORDERS.TOTAL.id]],
            { "display-name": "Named" },
          ])
            .aggregations()[0]
            .displayName(),
        ).toBe("Named");
      });
    });

    describe("addAggregation", () => {
      it("adds an aggregation", () => {
        expect(query.aggregate(["count"]).query()).toEqual({
          "source-table": ORDERS.id,
          aggregation: [["count"]],
        });
      });
    });

    describe("removeAggregation", () => {
      it("removes the correct aggregation", () => {
        pending();
      });
      it("removes all breakouts when removing the last aggregation", () => {
        pending();
      });
    });

    describe("updateAggregation", () => {
      it("updates the correct aggregation", () => {
        pending();
      });
      it('removes all breakouts and aggregations when setting an aggregation to "rows"', () => {
        pending();
      });
    });

    describe("clearAggregations", () => {
      it("clears all aggreagtions and breakouts", () => {
        pending();
      });
    });
  });

  // BREAKOUTS:
  describe("BREAKOUT METHODS", () => {
    describe("breakouts", () => {
      pending();
    });
    describe("breakoutOptions", () => {
      it("returns the correct count of dimensions", () => {
        expect(query.breakoutOptions().all().length).toBe(28);
      });

      it("excludes the already used breakouts", () => {
        const queryWithBreakout = query.breakout(["field-id", ORDERS.TOTAL.id]);
        expect(queryWithBreakout.breakoutOptions().all().length).toBe(27);
      });

      it("excludes the already used fk breakouts", () => {
        const queryWithBreakout = query.breakout(
          ORDERS.PRODUCT_ID.foreign(PRODUCTS.CATEGORY),
        );
        expect(queryWithBreakout.breakoutOptions().all().length).toBe(27);
      });

      it("includes an explicitly provided breakout although it has already been used", () => {
        const breakout = ["field-id", ORDERS.TOTAL.id];
        const queryWithBreakout = query.breakout(breakout);
        expect(queryWithBreakout.breakoutOptions().all().length).toBe(27);
        expect(queryWithBreakout.breakoutOptions(breakout).all().length).toBe(
          28,
        );
      });
    });
    describe("canAddBreakout", () => {
      pending();
    });
    describe("hasValidBreakout", () => {
      it("should return false if there are no breakouts", () => {
        expect(query.hasValidBreakout()).toBe(false);
      });
      it("should return true if there is at least one breakout", () => {
        expect(query.breakout(ORDERS.PRODUCT_ID).hasValidBreakout()).toBe(true);
      });
    });

    describe("addBreakout", () => {
      pending();
    });

    describe("removeBreakout", () => {
      pending();
    });

    describe("updateBreakout", () => {
      pending();
    });

    describe("clearBreakouts", () => {
      pending();
    });
  });

  // FILTERS:
  describe("FILTER METHODS", () => {
    describe("filters", () => {
      pending();
    });

    describe("filterDimensionOptions", () => {
      pending();
    });
    describe("filterSegmentOptions", () => {
      pending();
    });

    describe("segments", () => {
      it("should list any applied segments that are currently active filters", () => {
        const queryWithSegmentFilter = query.filter(["segment", 1]);
        // expect there to be segments
        expect(queryWithSegmentFilter.segments().length).toBe(1);
        // and they should actually be segments
        expect(queryWithSegmentFilter.segments()[0]).toBeInstanceOf(Segment);
      });
    });

    describe("canAddFilter", () => {
      pending();
    });

    describe("addFilter", () => {
      it("adds an filter", () => {
        pending();
      });
    });
    describe("removeFilter", () => {
      it("removes the correct filter", () => {
        pending();
      });
    });
    describe("updateFilter", () => {
      it("updates the correct filter", () => {
        pending();
      });
    });
    describe("clearFilters", () => {
      it("clears all filters", () => {
        pending();
      });
    });
  });

  describe("SORT METHODS", () => {
    describe("sorts", () => {
      it("return an empty array", () => {
        expect(query.sorts()).toEqual([]);
      });
      it("return an array with the sort clause", () => {
        expect(
          makeQuery({
            "order-by": [["asc", ["field-id", ORDERS.TOTAL.id]]],
          }).sorts(),
        ).toEqual([["asc", ["field-id", ORDERS.TOTAL.id]]]);
      });
    });

    describe("sortOptions", () => {
      it("returns the correct count of dimensions", () => {
        expect(query.sortOptions().dimensions.length).toBe(7);
      });

      it("excludes the already used sorts", () => {
        const queryWithBreakout = query.sort([
          "asc",
          ["field-id", ORDERS.TOTAL.id],
        ]);
        expect(queryWithBreakout.sortOptions().dimensions.length).toBe(6);
      });

      it("includes an explicitly provided sort although it has already been used", () => {
        const sort = ["asc", ["field-id", ORDERS.TOTAL.id]];
        const queryWithBreakout = query.sort(sort);
        expect(queryWithBreakout.sortOptions().dimensions.length).toBe(6);
        expect(queryWithBreakout.sortOptions(sort).dimensions.length).toBe(7);
      });
    });

    describe("canAddSort", () => {
      pending();
    });

    describe("addSort", () => {
      it("adds a sort", () => {
        pending();
      });
    });
    describe("updateSort", () => {
      it("", () => {
        pending();
      });
    });
    describe("removeSort", () => {
      it("removes the correct sort", () => {
        pending();
      });
    });
    describe("clearSort", () => {
      it("clears all sorts", () => {
        pending();
      });
    });
    describe("replaceSort", () => {
      it("replaces sorts with a new sort", () => {
        pending();
      });
    });
  });
  // LIMIT

  describe("LIMIT METHODS", () => {
    describe("limit", () => {
      it("returns null if there is no limit", () => {
        pending();
      });
      it("returns the limit if one has been set", () => {
        pending();
      });
    });

    describe("updateLimit", () => {
      it("updates the limit", () => {
        pending();
      });
    });
    describe("clearLimit", () => {
      it("clears the limit", () => {
        pending();
      });
    });
  });

  describe("EXPRESSION METHODS", () => {
    describe("expressions", () => {
      it("returns an empty map", () => {
        pending();
      });
      it("returns a map with the expressions", () => {
        pending();
      });
    });
    describe("updateExpression", () => {
      it("updates the correct expression", () => {
        pending();
      });
    });
    describe("removeExpression", () => {
      it("removes the correct expression", () => {
        pending();
      });
    });
  });

  describe("DIMENSION METHODS", () => {
    describe("fieldOptions", () => {
      it("includes the correct number of dimensions", () => {
        // Should just include the non-fk keys from the current table
        expect(query.fieldOptions().dimensions.length).toBe(7);
      });
      xit("does not include foreign key fields in the dimensions list", () => {
        const dimensions = query.fieldOptions().dimensions;
        const fkDimensions = dimensions.filter(
          dim => dim.field() && dim.field().isFK(),
        );
        expect(fkDimensions.length).toBe(0);
      });

      it("returns correct count of foreign keys", () => {
        expect(query.fieldOptions().fks.length).toBe(2);
      });
      it("returns a correct count of fields", () => {
        expect(query.fieldOptions().count).toBe(28);
      });
    });
    describe("dimensions", () => {
      pending();
    });
    describe("tableDimensions", () => {
      pending();
    });
    describe("expressionDimensions", () => {
      pending();
    });
    describe("breakoutDimensions", () => {
      pending();
    });
    describe("aggregationDimensions", () => {
      pending();
    });
  });

  describe("FIELD REFERENCE METHODS", () => {
    describe("fieldReferenceForColumn", () => {
      xit('should return `["field-id", 1]` for a normal column', () => {
        expect(query.fieldReferenceForColumn({ id: ORDERS.TOTAL.id })).toEqual([
          "field-id",
          ORDERS.TOTAL.id,
        ]);
      });
    });

    describe("parseFieldReference", () => {
      pending();
    });
  });

  describe("DATASET QUERY METHODS", () => {
    describe("setDatasetQuery", () => {
      it("replaces the previous dataset query with the provided one", () => {
        const newDatasetQuery = makeDatasetQuery({
          "source-table": ORDERS.id,
          aggregation: [["count"]],
        });

        expect(query.setDatasetQuery(newDatasetQuery).datasetQuery()).toBe(
          newDatasetQuery,
        );
      });
    });
  });
});

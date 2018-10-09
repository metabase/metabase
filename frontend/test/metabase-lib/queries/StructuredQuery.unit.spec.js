// HACK: needed due to cyclical dependency issue
import "metabase-lib/lib/Question";

import {
  metadata,
  question,
  DATABASE_ID,
  ANOTHER_DATABASE_ID,
  ORDERS_TABLE_ID,
  PRODUCT_TABLE_ID,
  ORDERS_TOTAL_FIELD_ID,
  MAIN_METRIC_ID,
  ORDERS_PRODUCT_FK_FIELD_ID,
  PRODUCT_TILE_FIELD_ID,
} from "__support__/sample_dataset_fixture";

import Segment from "metabase-lib/lib/metadata/Segment";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

function makeDatasetQuery(query) {
  return {
    type: "query",
    database: DATABASE_ID,
    query: {
      "source-table": ORDERS_TABLE_ID,
      ...query,
    },
  };
}

function makeQuery(query) {
  return new StructuredQuery(question, makeDatasetQuery(query));
}

function makeQueryWithAggregation(agg) {
  return makeQuery({ aggregation: [agg] });
}

const query = makeQuery({});

describe("StructuredQuery behavioral tests", () => {
  it("is able to filter by field which is already used for the query breakout", () => {
    const breakoutDimensionOptions = query.breakoutOptions().dimensions;
    const breakoutDimension = breakoutDimensionOptions.find(
      d => d.field().id === ORDERS_TOTAL_FIELD_ID,
    );

    expect(breakoutDimension).toBeDefined();

    const queryWithBreakout = query.addBreakout(breakoutDimension.mbql());

    const filterDimensionOptions = queryWithBreakout.filterFieldOptions()
      .dimensions;
    const filterDimension = filterDimensionOptions.find(
      d => d.field().id === ORDERS_TOTAL_FIELD_ID,
    );

    expect(filterDimension).toBeDefined();
  });
});

describe("StructuredQuery unit tests", () => {
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
        expect(query.table()).toBe(metadata.tables[ORDERS_TABLE_ID]);
      });
    });
    describe("databaseId", () => {
      it("returns the Database ID of the wrapped query ", () => {
        expect(query.databaseId()).toBe(DATABASE_ID);
      });
    });
    describe("database", () => {
      it("returns a dictionary with the underlying database of the wrapped query", () => {
        expect(query.database().id).toBe(DATABASE_ID);
      });
    });
    describe("engine", () => {
      it("identifies the engine of a query", () => {
        // This is a magic constant and we should probably pull this up into an enum
        expect(query.engine()).toBe("h2");
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
        expect(query.query()["source-table"]).toBe(ORDERS_TABLE_ID);
      });
    });
    describe("setDatabase", () => {
      it("allows you to set a new database", () => {
        expect(
          query.setDatabase(metadata.databases[ANOTHER_DATABASE_ID]).database()
            .id,
        ).toBe(ANOTHER_DATABASE_ID);
      });
    });
    describe("setTable", () => {
      it("allows you to set a new table", () => {
        expect(
          query.setTable(metadata.tables[PRODUCT_TABLE_ID]).tableId(),
        ).toBe(PRODUCT_TABLE_ID);
      });

      it("retains the correct database id when setting a new table", () => {
        expect(
          query.setTable(metadata.tables[PRODUCT_TABLE_ID]).table().database.id,
        ).toBe(DATABASE_ID);
      });
    });
    describe("tableId", () => {
      it("Return the right table id", () => {
        expect(query.tableId()).toBe(ORDERS_TABLE_ID);
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
        expect(query.addAggregation(["count"]).aggregations().length).toBe(1);
      });
      it("should return an actual count aggregation after trying to add it", () => {
        expect(query.addAggregation(["count"]).aggregations()[0]).toEqual([
          "count",
        ]);
      });
    });
    describe("aggregationsWrapped", () => {
      it("should return an empty list for an empty query", () => {
        expect(query.aggregationsWrapped().length).toBe(0);
      });
      it("should return a list with Aggregation after adding an aggregation", () => {
        expect(
          query
            .addAggregation(["count"])
            .aggregationsWrapped()[0]
            .isValid(),
        ).toBe(true);
      });
    });

    describe("aggregationOptions", () => {
      // TODO Atte Keinänen 6/14/17: Add the mock metadata for aggregation options
      // (currently the fixture doesn't include them)
      it("should return a non-empty list of options", () => {
        pending();
        expect(query.aggregationOptions().length).toBeGreaterThan(0);
      });
      it("should contain the count aggregation", () => {
        pending();
      });
    });
    describe("aggregationOptionsWithoutRaw", () => {
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
        expect(query.addAggregation(["count"]).canRemoveAggregation()).toBe(
          false,
        );
      });
      it("returns true for two aggregations", () => {
        expect(
          query
            .addAggregation(["count"])
            .addAggregation(["sum", ["field-id", ORDERS_TOTAL_FIELD_ID]])
            .canRemoveAggregation(),
        ).toBe(true);
      });
    });

    describe("isBareRows", () => {
      it("is true for an empty query", () => {
        expect(query.isBareRows()).toBe(true);
      });
      it("is false for a count aggregation", () => {
        expect(query.addAggregation(["count"]).isBareRows()).toBe(false);
      });
    });

    describe("aggregationName", () => {
      it("returns a saved metric's name", () => {
        expect(
          makeQueryWithAggregation([
            "metric",
            MAIN_METRIC_ID,
          ]).aggregationName(),
        ).toBe("Total Order Value");
      });
      it("returns a standard aggregation name", () => {
        expect(makeQueryWithAggregation(["count"]).aggregationName()).toBe(
          "Count of rows",
        );
      });
      it("returns a standard aggregation name with field", () => {
        expect(
          makeQueryWithAggregation([
            "sum",
            ["field-id", ORDERS_TOTAL_FIELD_ID],
          ]).aggregationName(),
        ).toBe("Sum of Total");
      });
      it("returns a standard aggregation name with fk field", () => {
        expect(
          makeQueryWithAggregation([
            "sum",
            ["fk->", ORDERS_PRODUCT_FK_FIELD_ID, PRODUCT_TILE_FIELD_ID],
          ]).aggregationName(),
        ).toBe("Sum of Title");
      });
      it("returns a custom expression description", () => {
        expect(
          makeQueryWithAggregation([
            "+",
            1,
            ["sum", ["field-id", ORDERS_TOTAL_FIELD_ID]],
          ]).aggregationName(),
        ).toBe("1 + Sum(Total)");
      });
      it("returns a named expression name", () => {
        expect(
          makeQueryWithAggregation([
            "named",
            ["sum", ["field-id", ORDERS_TOTAL_FIELD_ID]],
            "Named",
          ]).aggregationName(),
        ).toBe("Named");
      });
    });

    describe("addAggregation", () => {
      it("adds an aggregation", () => {
        expect(query.addAggregation(["count"]).query()).toEqual({
          "source-table": ORDERS_TABLE_ID,
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
        expect(query.breakoutOptions().dimensions.length).toBe(7);
      });

      it("excludes the already used breakouts", () => {
        const queryWithBreakout = query.addBreakout([
          "field-id",
          ORDERS_TOTAL_FIELD_ID,
        ]);
        expect(queryWithBreakout.breakoutOptions().dimensions.length).toBe(6);
      });

      it("includes an explicitly provided breakout although it has already been used", () => {
        const breakout = ["field-id", ORDERS_TOTAL_FIELD_ID];
        const queryWithBreakout = query.addBreakout(breakout);
        expect(queryWithBreakout.breakoutOptions().dimensions.length).toBe(6);
        expect(
          queryWithBreakout.breakoutOptions(breakout).dimensions.length,
        ).toBe(7);
      });
    });
    describe("canAddBreakout", () => {
      pending();
    });
    describe("hasValidBreakout", () => {
      pending();
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

    describe("filterFieldOptions", () => {
      pending();
    });
    describe("filterSegmentOptions", () => {
      pending();
    });

    describe("segments", () => {
      it("should list any applied segments that are currently active filters", () => {
        const queryWithSegmentFilter = query.addFilter(["segment", 1]);
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
            "order-by": ["asc", ["field-id", ORDERS_TOTAL_FIELD_ID]],
          }).sorts(),
        ).toEqual(["asc", ["field-id", ORDERS_TOTAL_FIELD_ID]]);
      });
    });

    describe("sortOptions", () => {
      it("returns the correct count of dimensions", () => {
        expect(query.sortOptions().dimensions.length).toBe(7);
      });

      it("excludes the already used sorts", () => {
        const queryWithBreakout = query.addSort([
          "asc",
          ["field-id", ORDERS_TOTAL_FIELD_ID],
        ]);
        expect(queryWithBreakout.sortOptions().dimensions.length).toBe(6);
      });

      it("includes an explicitly provided sort although it has already been used", () => {
        const sort = ["asc", ["field-id", ORDERS_TOTAL_FIELD_ID]];
        const queryWithBreakout = query.addSort(sort);
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
    describe("aggregationDimensions", () => {
      pending();
    });
    describe("metricDimensions", () => {
      pending();
    });
  });

  describe("FIELD REFERENCE METHODS", () => {
    describe("fieldReferenceForColumn", () => {
      pending();
    });

    describe("parseFieldReference", () => {
      pending();
    });
  });

  describe("DATASET QUERY METHODS", () => {
    describe("setDatasetQuery", () => {
      it("replaces the previous dataset query with the provided one", () => {
        const newDatasetQuery = makeDatasetQuery({
          "source-table": ORDERS_TABLE_ID,
          aggregation: [["count"]],
        });

        expect(query.setDatasetQuery(newDatasetQuery).datasetQuery()).toBe(
          newDatasetQuery,
        );
      });
    });
  });
});

// HACK: needed due to cyclical dependency issue
import "metabase-lib/lib/Question";

import {
    question,
    DATABASE_ID,
    MAIN_TABLE_ID,
    MAIN_FLOAT_FIELD_ID,
    MAIN_METRIC_ID,
    MAIN_FK_FIELD_ID,
    FOREIGN_TEXT_FIELD_ID
} from "metabase/__support__/fixtures";

import StructuredQuery from "./StructuredQuery";

function makeQuery(query) {
    return new StructuredQuery(question, {
        type: "query",
        database: DATABASE_ID,
        query: {
            source_table: MAIN_TABLE_ID,
            ...query
        }
    });
}

function makeQueryWithAggregation(agg) {
    return makeQuery({ aggregation: [agg] });
}

const query = makeQuery({});

describe("StructuredQuery", () => {
    describe("canRun", () => {
        it("", () => {});
    });
    describe("isEditable", () => {
        it("", () => {});
    });
    describe("tables", () => {
        it("", () => {});
    });
    describe("databaseId", () => {
        it("", () => {});
    });
    describe("database", () => {
        it("", () => {});
    });
    describe("engine", () => {
        it("", () => {});
    });
    describe("reset", () => {
        it("", () => {});
    });
    describe("query", () => {
        it("", () => {});
    });
    describe("setDatabase", () => {
        it("", () => {});
    });
    describe("setTable", () => {
        it("", () => {});
    });
    describe("tableId", () => {
        it("", () => {});
    });
    describe("table", () => {
        it("", () => {});
    });
    describe("tableMetadata", () => {
        it("", () => {});
    });

    // AGGREGATIONS:

    describe("aggregations", () => {
        it("", () => {});
    });
    describe("aggregationsWrapped", () => {
        it("", () => {});
    });

    describe("aggregationOptions", () => {
        it("", () => {});
    });
    describe("aggregationOptionsWithoutRaw", () => {
        it("", () => {});
    });

    describe("aggregationFieldOptions", () => {
        it("", () => {});
    });

    describe("canRemoveAggregation", () => {
        it("", () => {});
    });

    describe("isBareRows", () => {
        it("", () => {});
    });

    describe("aggregationName", () => {
        it("should return a saved metric's name", () => {
            expect(
                makeQueryWithAggregation([
                    "METRIC",
                    MAIN_METRIC_ID
                ]).aggregationName()
            ).toBe("Mock Metric");
        });
        it("should return a standard aggregation name", () => {
            expect(makeQueryWithAggregation(["count"]).aggregationName()).toBe(
                "Count of rows"
            );
        });
        it("should return a standard aggregation name with field", () => {
            expect(
                makeQueryWithAggregation([
                    "sum",
                    ["field-id", MAIN_FLOAT_FIELD_ID]
                ]).aggregationName()
            ).toBe("Sum of Mock Float Field");
        });
        it("should return a standard aggregation name with fk field", () => {
            expect(
                makeQueryWithAggregation([
                    "sum",
                    ["fk->", MAIN_FK_FIELD_ID, FOREIGN_TEXT_FIELD_ID]
                ]).aggregationName()
            ).toBe("Sum of Mock Foreign Text Field");
        });
        it("should return a custom expression description", () => {
            expect(
                makeQueryWithAggregation([
                    "+",
                    1,
                    ["sum", ["field-id", MAIN_FLOAT_FIELD_ID]]
                ]).aggregationName()
            ).toBe('1 + Sum("Mock Float Field")');
        });
        it("should return a named expression name", () => {
            expect(
                makeQueryWithAggregation([
                    "named",
                    ["sum", ["field-id", MAIN_FLOAT_FIELD_ID]],
                    "Named"
                ]).aggregationName()
            ).toBe("Named");
        });
    });

    describe("addAggregation", () => {
        it("should add an aggregation", () => {
            expect(query.addAggregation(["count"]).query()).toEqual({
                source_table: MAIN_TABLE_ID,
                aggregation: [["count"]]
            });
        });
    });

    describe("removeAggregation", () => {
        it("should remove the correct aggregation", () => {});
        it("should remove all breakouts when removing the last aggregation", () => {});
    });

    describe("updateAggregation", () => {
        it("should update the correct aggregation", () => {});
        it('should remove all breakouts and aggregations when setting an aggregation to "rows"', () => {});
    });

    describe("clearAggregations", () => {
        it("should clear all aggreagtions and breakouts", () => {});
    });

    // BREAKOUTS:

    describe("breakouts", () => {
        it("", () => {});
    });
    describe("breakoutOptions", () => {
        it("", () => {});
    });
    describe("canAddBreakout", () => {
        it("", () => {});
    });
    describe("hasValidBreakout", () => {
        it("", () => {});
    });

    describe("addBreakout", () => {
        it("should add an breakout", () => {});
    });

    describe("removeBreakout", () => {
        it("should remove the correct breakout", () => {});
    });

    describe("updateBreakout", () => {
        it("should update the correct breakout", () => {});
    });

    describe("clearBreakouts", () => {
        it("should clear all breakouts", () => {});
    });

    // FILTERS:

    describe("filters", () => {
        it("", () => {});
    });

    describe("filterFieldOptions", () => {
        it("", () => {});
    });
    describe("filterSegmentOptions", () => {
        it("", () => {});
    });

    describe("canAddFilter", () => {
        it("", () => {});
    });

    describe("addFilter", () => {
        it("should add an filter", () => {});
    });
    describe("removeFilter", () => {
        it("should remove the correct filter", () => {});
    });
    describe("updateFilter", () => {
        it("should update the correct filter", () => {});
    });
    describe("clearFilters", () => {
        it("should clear all filters", () => {});
    });

    // SORTS

    describe("sorts", () => {
        it("return an empty array", () => {
            expect(query.sorts()).toEqual([]);
        });
        it("return an array with the sort clause", () => {
            expect(
                makeQuery({
                    order_by: [["field-id", MAIN_FLOAT_FIELD_ID], "ascending"]
                }).sorts()
            ).toEqual([["field-id", MAIN_FLOAT_FIELD_ID], "ascending"]);
        });
    });

    describe("sortOptions", () => {
        it("", () => {});
    });

    describe("canAddSort", () => {
        it("", () => {});
    });

    describe("addSort", () => {
        it("should add a sort", () => {});
    });
    describe("updateSort", () => {
        it("", () => {});
    });
    describe("removeSort", () => {
        it("should remove the correct sort", () => {});
    });
    describe("clearSort", () => {
        it("should clear all sorts", () => {});
    });
    describe("replaceSort", () => {
        it("should all sorts with a new sort", () => {});
    });

    // LIMIT

    describe("limit", () => {
        it("should return null if there is no limit", () => {});
        it("should return the limit if one has been set", () => {});
    });

    describe("updateLimit", () => {
        it("should update the limit", () => {});
    });
    describe("clearLimit", () => {
        it("should clear the limit", () => {});
    });

    // EXPRESSIONS

    describe("expressions", () => {
        it("should return an empty map", () => {});
        it("should return a map with the expressions", () => {});
    });
    describe("updateExpression", () => {
        it("should update the correct expression", () => {});
    });
    describe("removeExpression", () => {
        it("should remove the correct expression", () => {});
    });

    describe("fieldOptions", () => {
        it("", () => {});
    });
    describe("dimensions", () => {
        it("", () => {});
    });
    describe("tableDimensions", () => {
        it("", () => {});
    });
    describe("expressionDimensions", () => {
        it("", () => {});
    });
    describe("aggregationDimensions", () => {
        it("", () => {});
    });
    describe("metricDimensions", () => {
        it("", () => {});
    });
    describe("fieldReferenceForColumn", () => {
        it("", () => {});
    });
    describe("parseFieldReference", () => {
        it("", () => {});
    });
    describe("setDatasetQuery", () => {
        it("", () => {});
    });
    describe("_updateQuery", () => {
        it("", () => {});
    });
});

import Query from "metabase/lib/query";
import { createQuery, AggregationClause, BreakoutClause } from "metabase/lib/query";


describe('Query', () => {
    describe('createQuery', () => {
        it("should provide a structured query with no args", () => {
            expect(createQuery()).toEqual({
                database: null,
                type: "query",
                query: {
                    source_table: null,
                    aggregation: ["rows"],
                    breakout: [],
                    filter: []
                }
            });
        });

        it("should be able to create a native type query", () => {
            expect(createQuery("native")).toEqual({
                database: null,
                type: "native",
                native: {
                    query: ""
                }
            });
        });

        it("should populate the databaseId if specified", () => {
            expect(createQuery("query", 123)).toEqual({
                database: 123,
                type: "query",
                query: {
                    source_table: null,
                    aggregation: ["rows"],
                    breakout: [],
                    filter: []
                }
            });
        });

        it("should populate the tableId if specified", () => {
            expect(createQuery("query", 123, 456)).toEqual({
                database: 123,
                type: "query",
                query: {
                    source_table: 456,
                    aggregation: ["rows"],
                    breakout: [],
                    filter: []
                }
            });
        });

        it("should NOT set the tableId if query type is native", () => {
            expect(createQuery("native", 123, 456)).toEqual({
                database: 123,
                type: "native",
                native: {
                    query: ""
                }
            });
        });

        it("should NOT populate the tableId if no database specified", () => {
            expect(createQuery("query", null, 456)).toEqual({
                database: null,
                type: "query",
                query: {
                    source_table: null,
                    aggregation: ["rows"],
                    breakout: [],
                    filter: []
                }
            });
        });
    });

    describe('cleanQuery', () => {
        it('should not remove complete sort clauses', () => {
            let query = {
                source_table: 0,
                aggregation: ["rows"],
                breakout: [],
                filter: [],
                order_by: [
                    [1, "ascending"]
                ]
            };
            Query.cleanQuery(query);
            expect(JSON.stringify(query.order_by)).toBe(JSON.stringify([[1, "ascending"]]));
        });
        it('should remove incomplete sort clauses', () => {
            let query = {
                source_table: 0,
                aggregation: ["rows"],
                breakout: [],
                filter: [],
                order_by: [
                    [null, "ascending"]
                ]
            };
            Query.cleanQuery(query);
            expect(query.order_by).toBe(undefined);
        });

        it('should not remove sort clauses on aggregations if that aggregation supports it', () => {
            let query = {
                source_table: 0,
                aggregation: ["count"],
                breakout: [1],
                filter: [],
                order_by: [
                    [["aggregation", 0], "ascending"]
                ]
            };
            Query.cleanQuery(query);
            expect(JSON.stringify(query.order_by)).toBe(JSON.stringify([[["aggregation", 0], "ascending"]]));
        });
        it('should remove sort clauses on aggregations if that aggregation doesn\'t support it', () => {
            let query = {
                source_table: 0,
                aggregation: ["rows"],
                breakout: [],
                filter: [],
                order_by: [
                    [["aggregation", 0], "ascending"]
                ]
            };
            Query.cleanQuery(query);
            expect(query.order_by).toBe(undefined);
        });

        it('should not remove sort clauses on fields appearing in breakout', () => {
            let query = {
                source_table: 0,
                aggregation: ["count"],
                breakout: [1],
                filter: [],
                order_by: [
                    [1, "ascending"]
                ]
            };
            Query.cleanQuery(query);
            expect(JSON.stringify(query.order_by)).toBe(JSON.stringify([[1, "ascending"]]));
        });
        it('should remove sort clauses on fields not appearing in breakout', () => {
            let query = {
                source_table: 0,
                aggregation: ["count"],
                breakout: [],
                filter: [],
                order_by: [
                    [1, "ascending"]
                ]
            };
            Query.cleanQuery(query);
            expect(query.order_by).toBe(undefined);
        });

        it('should not remove sort clauses with foreign keys on fields appearing in breakout', () => {
            let query = {
                source_table: 0,
                aggregation: ["count"],
                breakout: [["fk->", 1, 2]],
                filter: [],
                order_by: [
                    [["fk->", 1, 2], "ascending"]
                ]
            };
            Query.cleanQuery(query);
            expect(JSON.stringify(query.order_by)).toBe(JSON.stringify([[["fk->", 1, 2], "ascending"]]));
        });

        it('should not remove sort clauses with datetime_fields on fields appearing in breakout', () => {
            let query = {
                source_table: 0,
                aggregation: ["count"],
                breakout: [["datetime_field", 1, "as", "week"]],
                filter: [],
                order_by: [
                    [["datetime_field", 1, "as", "week"], "ascending"]
                ]
            };
            Query.cleanQuery(query);
            expect(JSON.stringify(query.order_by)).toBe(JSON.stringify([[["datetime_field", 1, "as", "week"], "ascending"]]));
        });

        it('should replace order_by clauses with the exact matching datetime_fields version in the breakout', () => {
            let query = {
                source_table: 0,
                aggregation: ["count"],
                breakout: [["datetime_field", 1, "as", "week"]],
                filter: [],
                order_by: [
                    [1, "ascending"]
                ]
            };
            Query.cleanQuery(query);
            expect(JSON.stringify(query.order_by)).toBe(JSON.stringify([[["datetime_field", 1, "as", "week"], "ascending"]]));
        });

        it('should replace order_by clauses with the exact matching fk-> version in the breakout', () => {
            let query = {
                source_table: 0,
                aggregation: ["count"],
                breakout: [["fk->", 1, 2]],
                filter: [],
                order_by: [
                    [2, "ascending"]
                ]
            };
            Query.cleanQuery(query);
            expect(JSON.stringify(query.order_by)).toBe(JSON.stringify([[["fk->", 1, 2], "ascending"]]));
        });
    });

    describe('removeDimension', () => {
        it('should remove the dimension', () => {
            let query = {
                source_table: 0,
                aggregation: ["count"],
                breakout: [1],
                filter: []
            };
            Query.removeDimension(query, 0);
            expect(query.breakout.length).toBe(0);
        });
        it('should remove sort clauses for the dimension that was removed', () => {
            let query = {
                source_table: 0,
                aggregation: ["count"],
                breakout: [1],
                filter: [],
                order_by: [
                    [1, "ascending"]
                ]
            };
            Query.removeDimension(query, 0);
            expect(query.order_by).toBe(undefined);
        });
    });
});


describe('AggregationClause', () => {

    describe('isValid', () => {
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
            expect(AggregationClause.isValid(["METRIC", 123])).toEqual(true);
            expect(AggregationClause.isValid(["rows"])).toEqual(true);
            expect(AggregationClause.isValid(["sum", 456])).toEqual(true);
        });
    });

    describe('isBareRows', () => {
        it("should fail on bad clauses", () => {
            expect(AggregationClause.isBareRows(undefined)).toEqual(false);
            expect(AggregationClause.isBareRows(null)).toEqual(false);
            expect(AggregationClause.isBareRows([])).toEqual(false);
            expect(AggregationClause.isBareRows([null])).toEqual(false);
            expect(AggregationClause.isBareRows("ab")).toEqual(false);
            expect(AggregationClause.isBareRows(["foo", null])).toEqual(false);
            expect(AggregationClause.isBareRows(["a", "b", "c"])).toEqual(false);
            expect(AggregationClause.isBareRows(["METRIC", 123])).toEqual(false);
            expect(AggregationClause.isBareRows(["sum", 456])).toEqual(false);
        });

        it("should succeed on good clauses", () => {
            expect(AggregationClause.isBareRows(["rows"])).toEqual(true);
        });
    });

    describe('isStandard', () => {
        it("should fail on bad clauses", () => {
            expect(AggregationClause.isStandard(undefined)).toEqual(false);
            expect(AggregationClause.isStandard(null)).toEqual(false);
            expect(AggregationClause.isStandard([])).toEqual(false);
            expect(AggregationClause.isStandard([null])).toEqual(false);
            expect(AggregationClause.isStandard("ab")).toEqual(false);
            expect(AggregationClause.isStandard(["foo", null])).toEqual(false);
            expect(AggregationClause.isStandard(["a", "b", "c"])).toEqual(false);
            expect(AggregationClause.isStandard(["METRIC", 123])).toEqual(false);
        });

        it("should succeed on good clauses", () => {
            expect(AggregationClause.isStandard(["rows"])).toEqual(true);
            expect(AggregationClause.isStandard(["sum", 456])).toEqual(true);
        });
    });

    describe('isMetric', () => {
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
            expect(AggregationClause.isMetric(["METRIC", 123])).toEqual(true);
        });
    });

    describe('getMetric', () => {
        it("should succeed on good clauses", () => {
            expect(AggregationClause.getMetric(["METRIC", 123])).toEqual(123);
        });

        it("should be null on non-metric clauses", () => {
            expect(AggregationClause.getMetric(["sum", 123])).toEqual(null);
        });
    });

    describe('getOperator', () => {
        it("should succeed on good clauses", () => {
            expect(AggregationClause.getOperator(["rows"])).toEqual("rows");
            expect(AggregationClause.getOperator(["sum", 123])).toEqual("sum");
        });

        it("should be null on metric clauses", () => {
            expect(AggregationClause.getOperator(["METRIC", 123])).toEqual(null);
        });
    });

    describe('getField', () => {
        it("should succeed on good clauses", () => {
            expect(AggregationClause.getField(["sum", 123])).toEqual(123);
        });

        it("should be null on clauses w/out a field", () => {
            expect(AggregationClause.getField(["rows"])).toEqual(null);
        });

        it("should be null on metric clauses", () => {
            expect(AggregationClause.getField(["METRIC", 123])).toEqual(null);
        });
    });

    describe('setField', () => {
        it("should succeed on good clauses", () => {
            expect(AggregationClause.setField(["avg"], 123)).toEqual(["avg", 123]);
            expect(AggregationClause.setField(["sum", null], 123)).toEqual(["sum", 123]);
        });

        it("should return unmodified on metric clauses", () => {
            expect(AggregationClause.setField(["METRIC", 123], 456)).toEqual(["METRIC", 123]);
        });
    });
});


describe('BreakoutClause', () => {

    describe('setBreakout', () => {
        it("should append if index is greater than current breakouts", () => {
            expect(BreakoutClause.setBreakout([], 0, 123)).toEqual([123]);
            expect(BreakoutClause.setBreakout([123], 1, 456)).toEqual([123, 456]);
            expect(BreakoutClause.setBreakout([123], 5, 456)).toEqual([123, 456]);
        });

        it("should replace if index already exists", () => {
            expect(BreakoutClause.setBreakout([123], 0, 456)).toEqual([456]);
        });
    });

    describe('removeBreakout', () => {
        it("should remove breakout if index exists", () => {
            expect(BreakoutClause.removeBreakout([123], 0)).toEqual([]);
            expect(BreakoutClause.removeBreakout([123, 456], 1)).toEqual([123]);
        });

        it("should make no changes if index does not exist", () => {
            expect(BreakoutClause.removeBreakout([123], 1)).toEqual([123]);
        });
    });
});

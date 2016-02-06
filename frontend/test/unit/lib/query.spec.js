/*eslint-env jasmine */

import Query from "metabase/lib/query";
import { createQuery } from "metabase/lib/query";


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

'use strict';

import Query from 'metabase/lib/query';

describe('Query', () => {
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
    });
});

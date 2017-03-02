import {
    getXValues,
    getColumnCardinality
} from 'metabase/visualizations/lib/utils';

describe('visualization.lib.utils', () => {
    describe('getXValues', () => {
        it("should not change the order of a single series of ascending numbers", () => {
            expect(getXValues([
                [[1],[2],[11]]
            ])).toEqual([1,2,11]);
        });
        it("should not change the order of a single series of descending numbers", () => {
            expect(getXValues([
                [[1],[2],[11]]
            ])).toEqual([1,2,11]);
        });
        it("should not change the order of a single series of non-ordered numbers", () => {
            expect(getXValues([
                [[2],[1],[11]]
            ])).toEqual([2,1,11]);
        });

        it("should not change the order of a single series of ascending strings", () => {
            expect(getXValues([
                [["1"],["2"],["11"]]
            ])).toEqual(["1","2","11"]);
        });
        it("should not change the order of a single series of descending strings", () => {
            expect(getXValues([
                [["1"],["2"],["11"]]
            ])).toEqual(["1","2","11"]);
        });
        it("should not change the order of a single series of non-ordered strings", () => {
            expect(getXValues([
                [["2"],["1"],["11"]]
            ])).toEqual(["2","1","11"]);
        });

        it("should correctly merge multiple series of ascending numbers", () => {
            expect(getXValues([
                [[2],[11],[12]],
                [[1],[2],[11]]
            ])).toEqual([1,2,11,12]);
        });
        it("should correctly merge multiple series of descending numbers", () => {
            expect(getXValues([
                [[12],[11],[2]],
                [[11],[2],[1]]
            ])).toEqual([12,11,2,1]);
        });
    });

    describe("getColumnCardinality", () => {
        it("should get column cardinality", () => {
            const cols = [{}];
            const rows = [[1],[2],[3],[3]];
            expect(getColumnCardinality(cols, rows, 0)).toEqual(3);
        });
        it("should get column cardinality for frozen column", () => {
            const cols = [{}];
            const rows = [[1],[2],[3],[3]];
            Object.freeze(cols[0]);
            expect(getColumnCardinality(cols, rows, 0)).toEqual(3);
        });
    })
});

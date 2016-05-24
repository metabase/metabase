import * as Query from "metabase/meta/Query";

describe("Query", () => {
    describe("addFilter()", () => {
        it("should add a filter when none exists", () => {
            let result = Query.addFilter({}, ["=", 1, 2]);
            expect(result).toEqual({ filters: ["=", 1, 2]});
        });
        it("should AND existing filter with new filter", () => {
            let result = Query.addFilter({ filters: ["=", 1, 2] }, ["=", 3, 4]);
            expect(result).toEqual({ filters: ["and", ["=", 1, 2], ["=", 3, 4]] });
        });
        it("should concatenate a filter to existing ANDed filters", () => {
            let result = Query.addFilter({ filters: ["and", ["=", 1, 2], ["=", 3, 4]] }, ["=", 5, 6]);
            expect(result).toEqual({ filters: ["and", ["=", 1, 2], ["=", 3, 4], ["=", 5, 6]] });
        });
    });
    describe("removeFilter()", () => {
        it("should remove entire filter clause if last filter is removed", () => {
            let result = Query.removeFilter({ filters: ["=", 1, 2]}, 0);
            expect(result).toEqual({ });
        });
        it("should remove AND clause if only one filter remains", () => {
            let result = Query.removeFilter({ filters: ["and", ["=", 1, 2], ["=", 3, 4]] }, 0);
            expect(result).toEqual({ filters: ["=", 3, 4] });
        });
        it("should remove correct filter", () => {
            let result = Query.removeFilter({ filters: ["and", ["=", 1, 2], ["=", 3, 4], ["=", 5, 6]] }, 1);
            expect(result).toEqual({ filters: ["and", ["=", 1, 2], ["=", 5, 6]] });
        });
    });
    describe("updateFilter()", () => {
        it("should update correct filter", () => {
            let result = Query.updateFilter({ filters: ["and", ["=", 1, 2], ["=", 3, 4], ["=", 5, 6]] }, 1, ["=", 7, 8]);
            expect(result).toEqual({ filters: ["and", ["=", 1, 2], ["=", 7, 8], ["=", 5, 6]] });
        });
    });
});

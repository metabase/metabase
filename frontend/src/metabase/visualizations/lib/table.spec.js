import { getTableCellClickedObject } from "./table";

const RAW_COLUMN = {
    source: "fields"
}
const METRIC_COLUMN = {
    source: "aggregation"
}
const DIMENSION_COLUMN = {
    source: "breakout"
}

describe("metabase/visualization/lib/table", () => {
    describe("getTableCellClickedObject", () => {
        describe("normal table", () => {
            it("should work with a raw data cell", () => {
                expect(getTableCellClickedObject({ rows: [[0]], cols: [RAW_COLUMN]}, 0, 0, false)).toEqual({
                    value: 0,
                    column: RAW_COLUMN
                });
            })
            it("should work with a dimension cell", () => {
                expect(getTableCellClickedObject({ rows: [[1, 2]], cols: [DIMENSION_COLUMN, METRIC_COLUMN]}, 0, 0, false)).toEqual({
                    value: 1,
                    column: DIMENSION_COLUMN
                });
            })
            it("should work with a metric cell", () => {
                expect(getTableCellClickedObject({ rows: [[1, 2]], cols: [DIMENSION_COLUMN, METRIC_COLUMN]}, 0, 1, false)).toEqual({
                    value: 2,
                    column: METRIC_COLUMN,
                    dimensions: [{
                        value: 1,
                        column: DIMENSION_COLUMN
                    }]
                });
            })
        })
        describe("pivoted table", () => {
            // TODO:
        })
    })
})

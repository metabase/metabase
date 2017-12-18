import { pivot } from "metabase/lib/data_grid";

import { TYPE } from "metabase/lib/types";

function makeData(rows) {
    return {
        rows: rows,
        cols: [
            { name: "D1", display_name: "Dimension 1", base_type: TYPE.Text },
            { name: "D2", display_name: "Dimension 2", base_type: TYPE.Text },
            { name: "M",  display_name: "Metric",      base_type: TYPE.Integer }
        ]
    };
}

describe("data_grid", () => {
    describe("pivot", () => {

        it("should pivot values correctly", () => {
            let data = makeData([
                ["a", "x", 1],
                ["a", "y", 2],
                ["a", "z", 3],
                ["b", "x", 4],
                ["b", "y", 5],
                ["b", "z", 6]
            ])
            let pivotedData = pivot(data);
            expect(pivotedData.cols.length).toEqual(3);
            expect(pivotedData.rows.map(row => [...row])).toEqual([
                ["x", 1, 4],
                ["y", 2, 5],
                ["z", 3, 6]
            ]);
        })

        it("should not return null column names from null values", () => {
            let data = makeData([
                [null, null, 1]
            ]);
            let pivotedData = pivot(data);
            expect(pivotedData.rows.length).toEqual(1);
            expect(pivotedData.cols.length).toEqual(2);
            expect(pivotedData.cols[0].name).toEqual(jasmine.any(String));
            expect(pivotedData.cols[0].display_name).toEqual(jasmine.any(String));
            expect(pivotedData.cols[1].name).toEqual(jasmine.any(String));
            expect(pivotedData.cols[1].display_name).toEqual(jasmine.any(String));
        })
    })
})

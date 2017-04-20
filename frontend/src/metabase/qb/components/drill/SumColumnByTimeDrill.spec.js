/* eslint-disable flowtype/require-valid-file-annotation */

import SumColumnByTimeDrill from "./SumColumnByTimeDrill";

import {
    card,
    tableMetadata,
    clickedFloatHeader
} from "../__support__/fixtures";

describe("SumColumnByTimeDrill", () => {
    it("should not be valid for top level actions", () => {
        expect(SumColumnByTimeDrill({ card, tableMetadata })).toHaveLength(0);
    });
    it("should not be valid if there is no time field", () => {
        expect(
            SumColumnByTimeDrill({
                card,
                tableMetadata: { fields: [] },
                clicked: clickedFloatHeader
            })
        ).toHaveLength(0);
    });
    it("should be return correct new card", () => {
        const actions = SumColumnByTimeDrill({
            card,
            tableMetadata,
            clicked: clickedFloatHeader
        });
        expect(actions).toHaveLength(1);
        const newCard = actions[0].card();
        expect(newCard.dataset_query.query).toEqual({
            source_table: 10,
            aggregation: [["sum", ["field-id", 1]]],
            breakout: [["datetime-field", ["field-id", 3], "as", "day"]]
        });
        expect(newCard.display).toEqual("line");
    });
});

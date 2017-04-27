/* eslint-disable flowtype/require-valid-file-annotation */

import SummarizeColumnByTimeDrill from "./SummarizeColumnByTimeDrill";

import {
    card,
    tableMetadata,
    clickedFloatHeader
} from "../__support__/fixtures";

describe("SummarizeColumnByTimeDrill", () => {
    it("should not be valid for top level actions", () => {
        expect(
            SummarizeColumnByTimeDrill({ card, tableMetadata })
        ).toHaveLength(0);
    });
    it("should not be valid if there is no time field", () => {
        expect(
            SummarizeColumnByTimeDrill({
                card,
                tableMetadata: { fields: [] },
                clicked: clickedFloatHeader
            })
        ).toHaveLength(0);
    });
    it("should be return correct new card", () => {
        const actions = SummarizeColumnByTimeDrill({
            card,
            tableMetadata,
            clicked: clickedFloatHeader
        });
        expect(actions).toHaveLength(2);
        const newCard = actions[0].card();
        expect(newCard.dataset_query.query).toEqual({
            source_table: 10,
            aggregation: [["sum", ["field-id", 1]]],
            breakout: [["datetime-field", ["field-id", 3], "as", "day"]]
        });
        expect(newCard.display).toEqual("line");
    });
});

/* eslint-disable */

import SummarizeColumnDrill from "./SummarizeColumnDrill";

import {
    card,
    tableMetadata,
    clickedFloatHeader
} from "../__support__/fixtures";

describe("SummarizeColumnDrill", () => {
    it("should not be valid for top level actions", () => {
        expect(SummarizeColumnDrill({ card, tableMetadata })).toHaveLength(0);
    });
    it("should be valid for click on numeric column header", () => {
        const actions = SummarizeColumnDrill({
            card,
            tableMetadata,
            clicked: clickedFloatHeader
        });
        expect(actions.length).toEqual(5);
        let newCard = actions[0].card();
        expect(newCard.dataset_query.query).toEqual({
            aggregation: [["min", ["field-id", 1]]]
        });
        expect(newCard.display).toEqual("scalar");
    });
});

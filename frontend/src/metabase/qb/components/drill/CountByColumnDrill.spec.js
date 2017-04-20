/* eslint-disable flowtype/require-valid-file-annotation */

import CountByColumnDrill from "./CountByColumnDrill";

import {
    card,
    tableMetadata,
    clickedCategoryHeader
} from "../__support__/fixtures";

describe("CountByColumnDrill", () => {
    it("should not be valid for top level actions", () => {
        expect(CountByColumnDrill({ card, tableMetadata })).toHaveLength(0);
    });
    it("should be valid for click on numeric column header", () => {
        expect(
            CountByColumnDrill({
                card,
                tableMetadata,
                clicked: clickedCategoryHeader
            })
        ).toHaveLength(1);
    });
    it("should be return correct new card", () => {
        const actions = CountByColumnDrill({
            card,
            tableMetadata,
            clicked: clickedCategoryHeader
        });
        expect(actions).toHaveLength(1);
        const newCard = actions[0].card();
        expect(newCard.dataset_query.query).toEqual({
            source_table: 10,
            aggregation: [["count"]],
            breakout: [["field-id", 2]]
        });
        expect(newCard.display).toEqual("bar");
    });
});

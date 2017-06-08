/* eslint-disable flowtype/require-valid-file-annotation */

import CountByColumnDrill from "./CountByColumnDrill";

import {
    question,
    clickedCategoryHeader,
    MAIN_TABLE_ID,
    MAIN_CATEGORY_FIELD_ID
} from "metabase/__support__/fixtures";

describe("CountByColumnDrill", () => {
    it("should not be valid for top level actions", () => {
        expect(CountByColumnDrill({ question })).toHaveLength(0);
    });
    it("should be valid for click on numeric column header", () => {
        expect(
            CountByColumnDrill({
                question,
                clicked: clickedCategoryHeader
            })
        ).toHaveLength(1);
    });
    it("should be return correct new card", () => {
        const actions = CountByColumnDrill({
            question,
            clicked: clickedCategoryHeader
        });
        expect(actions).toHaveLength(1);
        const newCard = actions[0].question().card();
        expect(newCard.dataset_query.query).toEqual({
            source_table: MAIN_TABLE_ID,
            aggregation: [["count"]],
            breakout: [["field-id", MAIN_CATEGORY_FIELD_ID]]
        });
        expect(newCard.display).toEqual("bar");
    });
});

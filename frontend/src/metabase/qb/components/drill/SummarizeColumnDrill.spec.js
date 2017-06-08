/* eslint-disable */

import SummarizeColumnDrill from "./SummarizeColumnDrill";

import {
    question,
    clickedFloatHeader,
    MAIN_TABLE_ID,
    MAIN_FLOAT_FIELD_ID
} from "metabase/__support__/fixtures";

describe("SummarizeColumnDrill", () => {
    it("should not be valid for top level actions", () => {
        expect(SummarizeColumnDrill({ question })).toHaveLength(0);
    });
    it("should be valid for click on numeric column header", () => {
        const actions = SummarizeColumnDrill({
            question,
            clicked: clickedFloatHeader
        });
        expect(actions.length).toEqual(5);
        let newCard = actions[0].question().card();
        expect(newCard.dataset_query.query).toEqual({
            source_table: MAIN_TABLE_ID,
            aggregation: [["sum", ["field-id", MAIN_FLOAT_FIELD_ID]]]
        });
        expect(newCard.display).toEqual("scalar");
    });
});

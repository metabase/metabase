/* eslint-disable flowtype/require-valid-file-annotation */

import {
    question,
    questionNoFields,
    clickedFloatHeader,
    MAIN_TABLE_ID,
    MAIN_FLOAT_FIELD_ID,
    MAIN_DATE_FIELD_ID
} from "metabase/__support__/fixtures";

import SummarizeColumnByTimeDrill from "./SummarizeColumnByTimeDrill";

describe("SummarizeColumnByTimeDrill", () => {
    it("should not be valid for top level actions", () => {
        expect(SummarizeColumnByTimeDrill({ question })).toHaveLength(0);
    });
    it("should not be valid if there is no time field", () => {
        expect(
            SummarizeColumnByTimeDrill({
                question: questionNoFields,
                clicked: clickedFloatHeader
            })
        ).toHaveLength(0);
    });
    it("should be return correct new card", () => {
        const actions = SummarizeColumnByTimeDrill({
            question: question,
            clicked: clickedFloatHeader
        });
        expect(actions).toHaveLength(2);
        const newCard = actions[0].question().card();
        expect(newCard.dataset_query.query).toEqual({
            source_table: MAIN_TABLE_ID,
            aggregation: [["sum", ["field-id", MAIN_FLOAT_FIELD_ID]]],
            breakout: [
                [
                    "datetime-field",
                    ["field-id", MAIN_DATE_FIELD_ID],
                    "as",
                    "day"
                ]
            ]
        });
        expect(newCard.display).toEqual("line");
    });
});

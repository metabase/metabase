/* eslint-disable flowtype/require-valid-file-annotation */

import {
    question,
    questionNoFields,
    MAIN_TABLE_ID,
    MAIN_DATE_FIELD_ID
} from "metabase/__support__/fixtures";

import CountByTimeAction from "./CountByTimeAction";

describe("CountByTimeAction", () => {
    it("should not be valid if the table has no metrics", () => {
        expect(CountByTimeAction({ question: questionNoFields })).toHaveLength(
            0
        );
    });
    it("should return a scalar card for the metric", () => {
        const actions = CountByTimeAction({ question: question });
        expect(actions).toHaveLength(1);
        const newCard = actions[0].question().card();
        expect(newCard.dataset_query.query).toEqual({
            source_table: MAIN_TABLE_ID,
            aggregation: [["count"]],
            breakout: [
                [
                    "datetime-field",
                    ["field-id", MAIN_DATE_FIELD_ID],
                    "as",
                    "day"
                ]
            ]
        });
        expect(newCard.display).toEqual("bar");
    });
});

/* eslint-disable flowtype/require-valid-file-annotation */

import ObjectDetailDrill from "./ObjectDetailDrill";

import {
    question,
    clickedFloatValue,
    clickedPKValue,
    clickedFKValue,
    MAIN_TABLE_ID,
    FOREIGN_TABLE_ID,
    MAIN_PK_FIELD_ID,
    FOREIGN_PK_FIELD_ID
} from "../__support__/fixtures";

describe("ObjectDetailDrill", () => {
    it("should not be valid non-PK cells", () => {
        expect(
            ObjectDetailDrill({
                question,
                clicked: clickedFloatValue
            })
        ).toHaveLength(0);
    });
    it("should be return correct new card for PKs", () => {
        const actions = ObjectDetailDrill({
            question,
            clicked: clickedPKValue
        });
        expect(actions).toHaveLength(1);
        const newCard = actions[0].question().card();
        expect(newCard.dataset_query.query).toEqual({
            source_table: MAIN_TABLE_ID,
            filter: ["=", ["field-id", MAIN_PK_FIELD_ID], 42]
        });
        expect(newCard.display).toEqual(undefined);
    });
    it("should be return correct new card for FKs", () => {
        const actions = ObjectDetailDrill({
            question,
            clicked: clickedFKValue
        });
        expect(actions).toHaveLength(1);
        const newCard = actions[0].question().card();
        expect(newCard.dataset_query.query).toEqual({
            source_table: FOREIGN_TABLE_ID,
            filter: ["=", ["field-id", FOREIGN_PK_FIELD_ID], 43]
        });
        expect(newCard.display).toEqual(undefined);
    });
});

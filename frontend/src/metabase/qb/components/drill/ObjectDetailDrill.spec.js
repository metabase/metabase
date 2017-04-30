/* eslint-disable flowtype/require-valid-file-annotation */

import ObjectDetailDrill from "./ObjectDetailDrill";

import {
    card,
    tableMetadata,
    clickedFloatValue,
    clickedPKValue,
    clickedFKValue
} from "../__support__/fixtures";

describe("ObjectDetailDrill", () => {
    it("should not be valid non-PK cells", () => {
        expect(
            ObjectDetailDrill({
                card,
                tableMetadata,
                clicked: clickedFloatValue
            })
        ).toHaveLength(0);
    });
    it("should be return correct new card for PKs", () => {
        const actions = ObjectDetailDrill({
            card,
            tableMetadata,
            clicked: clickedPKValue
        });
        expect(actions).toHaveLength(1);
        const newCard = actions[0].card();
        expect(newCard.dataset_query.query).toEqual({
            source_table: 10,
            filter: ["=", ["field-id", 4], 42]
        });
        expect(newCard.display).toEqual("table");
    });
    it("should be return correct new card for FKs", () => {
        const actions = ObjectDetailDrill({
            card,
            tableMetadata,
            clicked: clickedFKValue
        });
        expect(actions).toHaveLength(1);
        const newCard = actions[0].card();
        expect(newCard.dataset_query.query).toEqual({
            source_table: 20,
            filter: ["=", ["field-id", 25], 43]
        });
        expect(newCard.display).toEqual("table");
    });
});

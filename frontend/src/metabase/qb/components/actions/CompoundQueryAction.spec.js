/* eslint-disable flowtype/require-valid-file-annotation */

import CompoundQueryAction from "./CompoundQueryAction";

import {
    savedCard,
    nativeCard,
    savedNativeCard,
    tableMetadata
} from "../__support__/fixtures";

describe("CompoundQueryAction", () => {
    it("should not suggest a compount query for an unsaved native query", () => {
        expect(
            CompoundQueryAction({
                card: nativeCard,
                tableMetadata: tableMetadata
            })
        ).toHaveLength(0);
    });
    it("should suggest a compound query for a mbql query", () => {
        const actions = CompoundQueryAction({
            card: savedCard,
            tableMetadata: tableMetadata
        });
        expect(actions).toHaveLength(1);
        const newCard = actions[0].card();
        expect(newCard.dataset_query.query).toEqual({
            source_table: "card__1"
        });
    });

    it("should return a nested query for a saved native card", () => {
        const actions = CompoundQueryAction({
            card: savedNativeCard,
            tableMetadata: tableMetadata
        });
        expect(actions).toHaveLength(1);
        const newCard = actions[0].card();
        expect(newCard.dataset_query.query).toEqual({
            source_table: "card__2"
        });
    });
});

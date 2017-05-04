/* eslint-disable flowtype/require-valid-file-annotation */

import CountByTimeAction from "./CountByTimeAction";

import { card, tableMetadata } from "../__support__/fixtures";

const tableMetadata0TimeFields = { ...tableMetadata, fields: [] };
const tableMetadata1TimeField = tableMetadata;

describe("CountByTimeAction", () => {
    it("should not be valid if the table has no metrics", () => {
        expect(
            CountByTimeAction({
                card,
                tableMetadata: tableMetadata0TimeFields
            })
        ).toHaveLength(0);
    });
    it("should return a scalar card for the metric", () => {
        const actions = CountByTimeAction({
            card,
            tableMetadata: tableMetadata1TimeField
        });
        expect(actions).toHaveLength(1);
        const newCard = actions[0].card();
        expect(newCard.dataset_query.query).toEqual({
            source_table: 10,
            aggregation: [["count"]],
            breakout: [["datetime-field", ["field-id", 3], "as", "day"]]
        });
        expect(newCard.display).toEqual("line");
    });
});

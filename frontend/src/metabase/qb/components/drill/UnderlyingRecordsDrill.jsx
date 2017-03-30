/* @flow weak */

import React from "react";

import { drillUnderlyingRecords } from "metabase/qb/lib/actions";

import { inflect } from "metabase/lib/formatting";

export default ({ card, tableMetadata, clicked }) => {
    let dimensions = clicked.dimensions || [];
    if (dimensions.length === 0) {
        return;
    }

    // the metric value should be the number of rows that will be displayed
    const count = typeof clicked.value === "number" ? clicked.value : 2;

    return {
        title: (
            <span>
                View {inflect("these", count, "this", "these")}
                {" "}
                <span className="text-dark">
                    {inflect(tableMetadata.display_name, count)}
                </span>
            </span>
        ),
        card: () => drillUnderlyingRecords(card, dimensions)
    };
};

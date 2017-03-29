/* @flow weak */

import React from "react";

import { pivot, drillDownForDimensions } from "metabase/qb/lib/actions";

export default ({ card, tableMetadata, clicked }) => {
    const dimensions = clicked.dimensions || [];
    const drilldown = drillDownForDimensions(dimensions);
    if (!drilldown) {
        return;
    }

    return {
        title: (
            <span>
                Drill into this
                {" "}
                <span className="text-dark">
                    {drilldown.name}
                </span>
            </span>
        ),
        card: () => pivot(card, drilldown.breakout, tableMetadata, dimensions)
    };
};

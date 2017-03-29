/* @flow weak */

import React from "react";

import { drillTimeseriesFilter } from "metabase/qb/lib/actions";

export default ({ card, tableMetadata, clicked }) => {
    if (!clicked || !clicked.column || !clicked.column.unit) {
        return;
    }

    return {
        title: (
            <span>
                Drill into this
                {" "}
                <span className="text-dark">
                    {clicked.column.unit}
                </span>
            </span>
        ),
        card: () => drillTimeseriesFilter(card, clicked.value, clicked.column)
    };
};

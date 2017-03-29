/* @flow weak */

import React from "react";

import { drillUnderlyingRecords } from "metabase/qb/lib/actions";

import { isPK } from "metabase/lib/types";

export default ({ card, tableMetadata, clicked }) => {
    let dimensions = clicked.dimensions || [];
    if (dimensions.length === 0) {
        return;
    }

    return {
        title: (
            <span>
                View these
                {" "}
                <span className="text-dark">{tableMetadata.display_name}</span>
            </span>
        ),
        card: () => drillUnderlyingRecords(card, dimensions)
    };
};

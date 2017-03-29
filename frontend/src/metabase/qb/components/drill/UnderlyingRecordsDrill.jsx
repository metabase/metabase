/* @flow weak */

import React from "react";

import { drillUnderlyingRecords } from "metabase/qb/lib/actions";

import { isPK } from "metabase/lib/types";

export default ({ card, tableMetadata, clicked }) => {
    if (
        !clicked ||
        !clicked.column ||
        clicked.column.id == null ||
        isPK(clicked.column.special_type)
    ) {
        return;
    }

    return {
        title: (
            <span>
                Filter
                {" "}
                <span className="text-dark">{tableMetadata.display_name}</span>
                {" "}
                by this value
            </span>
        ),
        card: () => drillUnderlyingRecords(card, clicked.value, clicked.column)
    };
};

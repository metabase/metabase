/* @flow weak */

import React from "react";

import { toUnderlyingRecords } from "metabase/qb/lib/actions";
import * as Query from "metabase/lib/query/query";

export default ({ card, tableMetadata }) => {
    if (!Query.isBareRows(card.dataset_query.query)) {
        return {
            title: (
                <span>
                    View the underlying
                    {" "}
                    <span className="text-dark">
                        {tableMetadata.display_name}
                    </span>
                    {" "}
                    records
                </span>
            ),
            icon: "table",
            card: () => toUnderlyingRecords(card)
        };
    }
};

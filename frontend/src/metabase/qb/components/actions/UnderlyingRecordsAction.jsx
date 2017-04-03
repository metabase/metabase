/* @flow */

import React from "react";

import { toUnderlyingRecords } from "metabase/qb/lib/actions";
import * as Query from "metabase/lib/query/query";
import * as Card from "metabase/meta/Card";

import type { ClickActionProps } from "metabase/meta/types/Visualization";

export default ({ card, tableMetadata }: ClickActionProps) => {
    const query = Card.getQuery(card);
    if (!query) {
        return;
    }
    if (!Query.isBareRows(query)) {
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

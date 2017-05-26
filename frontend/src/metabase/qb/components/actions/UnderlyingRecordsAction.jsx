/* @flow */

import React from "react";

import { toUnderlyingRecords } from "metabase/qb/lib/actions";
import * as Query from "metabase/lib/query/query";
import * as Card from "metabase/meta/Card";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default ({ card, tableMetadata }: ClickActionProps): ClickAction[] => {
    const query = Card.getQuery(card);
    if (query && !Query.isBareRows(query)) {
        return [
            {
                name: "underlying-records",
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
                icon: "table2",
                card: () => toUnderlyingRecords(card)
            }
        ];
    }
    return [];
};

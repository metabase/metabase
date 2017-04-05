/* @flow */

import React from "react";

import { assocIn } from "icepick";
import Query from "metabase/lib/query";
import * as Card from "metabase/meta/Card";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default (
    { card, tableMetadata, clicked }: ClickActionProps
): ?ClickAction => {
    const query = Card.getQuery(card);

    if (
        !query ||
        !clicked ||
        !clicked.column ||
        clicked.value !== undefined ||
        !clicked.column.source
    ) {
        return;
    }
    const { column } = clicked;

    return {
        title: (
            <span>
                Sort by {column.display_name}
            </span>
        ),
        default: true,
        card: () => {
            let field = null;
            if (column.id == null) {
                // ICK.  this is hacky for dealing with aggregations.  need something better
                // DOUBLE ICK.  we also need to deal with custom fields now as well
                const expressions = Query.getExpressions(query);
                if (column.display_name in expressions) {
                    field = ["expression", column.display_name];
                } else {
                    field = ["aggregation", 0];
                }
            } else {
                field = column.id;
            }

            let sortClause = [field, "ascending"];

            if (
                query.order_by &&
                query.order_by.length > 0 &&
                query.order_by[0].length > 0 &&
                query.order_by[0][1] === "ascending" &&
                Query.isSameField(query.order_by[0][0], field)
            ) {
                // someone triggered another sort on the same column, so flip the sort direction
                sortClause = [field, "descending"];
            }

            // set clause
            return assocIn(
                card,
                ["dataset_query", "query", "order_by"],
                [sortClause]
            );
        }
    };
};

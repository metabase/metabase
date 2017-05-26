/* @flow */

import { assocIn, getIn } from "icepick";
import Query from "metabase/lib/query";
import * as Card from "metabase/meta/Card";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default (
    { card, tableMetadata, clicked }: ClickActionProps
): ClickAction[] => {
    const query = Card.getQuery(card);

    if (
        !query ||
        !clicked ||
        !clicked.column ||
        clicked.value !== undefined ||
        !clicked.column.source
    ) {
        return [];
    }
    const { column } = clicked;

    const field = getFieldFromColumn(column, query);

    const [sortField, sortDirection] = getIn(query, ["order_by", 0]) || [];
    const isAlreadySorted = sortField != null &&
        Query.isSameField(sortField, field);

    const actions = [];
    if (
        !isAlreadySorted ||
        sortDirection === "descending" ||
        sortDirection === "desc"
    ) {
        actions.push({
            name: "sort-ascending",
            section: "sort",
            title: "Ascending",
            card: () =>
                assocIn(
                    card,
                    ["dataset_query", "query", "order_by"],
                    [[field, "ascending"]]
                )
        });
    }
    if (
        !isAlreadySorted ||
        sortDirection === "ascending" ||
        sortDirection === "asc"
    ) {
        actions.push({
            name: "sort-descending",
            section: "sort",
            title: "Descending",
            card: () =>
                assocIn(
                    card,
                    ["dataset_query", "query", "order_by"],
                    [[field, "descending"]]
                )
        });
    }
    return actions;
};

function getFieldFromColumn(column, query) {
    if (column.id == null) {
        // ICK.  this is hacky for dealing with aggregations.  need something better
        // DOUBLE ICK.  we also need to deal with custom fields now as well
        const expressions = Query.getExpressions(query);
        if (column.display_name in expressions) {
            return ["expression", column.display_name];
        } else {
            return ["aggregation", 0];
        }
    } else {
        return column.id;
    }
}

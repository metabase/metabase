/* @flow */

import React from "react";

import { summarize, getFieldClauseFromCol } from "metabase/qb/lib/actions";
import * as Card from "metabase/meta/Card";
import { isNumeric } from "metabase/lib/schema_metadata";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

const AGGREGATIONS = {
    min: "Minimum",
    max: "Maximum",
    avg: "Average",
    sum: "Sum",
    distinct: "Distinct Values"
};

export default (
    { card, tableMetadata, clicked }: ClickActionProps
): ClickAction[] => {
    const query = Card.getQuery(card);

    if (
        !query ||
        !clicked ||
        !clicked.column ||
        clicked.value !== undefined ||
        clicked.column.source !== "fields" ||
        !isNumeric(clicked.column)
    ) {
        return [];
    }
    const { column } = clicked;

    return Object.entries(AGGREGATIONS).map(([aggregation, name]) => ({
        title: <span>{name} of {column.display_name}</span>,
        card: () =>
            summarize(
                card,
                [aggregation, getFieldClauseFromCol(column)],
                tableMetadata
            )
    }));
};

/* @flow */

import React from "react";

import {
    pivot,
    summarize,
    getFieldClauseFromCol
} from "metabase/qb/lib/actions";
import * as Card from "metabase/meta/Card";
import { isNumeric, isDate } from "metabase/lib/schema_metadata";
import { capitalize } from "metabase/lib/formatting";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default (
    { card, tableMetadata, clicked }: ClickActionProps
): ClickAction[] => {
    const query = Card.getQuery(card);

    const dateField = tableMetadata.fields.filter(isDate)[0];

    if (
        !dateField ||
        !query ||
        !clicked ||
        !clicked.column ||
        clicked.value !== undefined ||
        !isNumeric(clicked.column)
    ) {
        return [];
    }
    const { column } = clicked;

    return ["sum", "count"].map(aggregation => ({
        name: "summarize-by-time",
        section: "sum",
        title: <span>{capitalize(aggregation)} by time</span>,
        card: () =>
            pivot(
                summarize(
                    card,
                    [aggregation, getFieldClauseFromCol(column)],
                    tableMetadata
                ),
                [
                    "datetime-field",
                    getFieldClauseFromCol(dateField),
                    "as",
                    "day"
                ],
                tableMetadata
            )
    }));
};

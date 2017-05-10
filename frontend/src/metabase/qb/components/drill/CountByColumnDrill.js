/* @flow */

import React from "react";

import {
    summarize,
    pivot,
    getFieldClauseFromCol
} from "metabase/qb/lib/actions";
import * as Card from "metabase/meta/Card";
import { isCategory } from "metabase/lib/schema_metadata";

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
        clicked.column.source !== "fields" ||
        !isCategory(clicked.column)
    ) {
        return [];
    }
    const { column } = clicked;

    return [
        {
            name: "count-by-column",
            section: "distribution",
            title: <span>Distribution</span>,
            card: () =>
                pivot(
                    summarize(card, ["count"], tableMetadata),
                    getFieldClauseFromCol(column),
                    tableMetadata
                )
        }
    ];
};

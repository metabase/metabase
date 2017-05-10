/* @flow */

import React from "react";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

import { isDate } from "metabase/lib/schema_metadata";
import { summarize, breakout } from "metabase/qb/lib/actions";

export default ({ card, tableMetadata }: ClickActionProps): ClickAction[] => {
    const dateField = tableMetadata.fields.filter(isDate)[0];
    if (!dateField) {
        return [];
    }

    return [
        {
            name: "count-by-time",
            section: "sum",
            title: <span>Count of rows by time</span>,
            icon: "line",
            card: () =>
                breakout(
                    summarize(card, ["count"], tableMetadata),
                    ["datetime-field", ["field-id", dateField.id], "as", "day"],
                    tableMetadata
                )
        }
    ];
};

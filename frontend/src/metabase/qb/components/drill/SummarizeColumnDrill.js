/* @flow */

import { summarize, getFieldClauseFromCol } from "metabase/qb/lib/actions";
import * as Card from "metabase/meta/Card";
import { isNumeric } from "metabase/lib/schema_metadata";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

const AGGREGATIONS = {
    sum: {
        section: "sum",
        title: "Sum"
    },
    avg: {
        section: "distribution",
        title: "Avg"
    },
    min: {
        section: "distribution",
        title: "Min"
    },
    max: {
        section: "distribution",
        title: "Max"
    },
    distinct: {
        section: "distribution",
        title: "Distincts"
    }
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

    // $FlowFixMe
    return Object.entries(AGGREGATIONS).map(([aggregation, action]) => ({
        ...action,
        card: () =>
            summarize(
                card,
                [aggregation, getFieldClauseFromCol(column)],
                tableMetadata
            )
    }));
};

/* @flow */

import React from "react";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

import { summarize } from "metabase/qb/lib/actions";

export default ({ card, tableMetadata }: ClickActionProps): ClickAction[] => {
    return tableMetadata.metrics.slice(0, 5).map(metric => ({
        name: "common-metric",
        title: <span>View <strong>{metric.name}</strong></span>,
        card: () => summarize(card, ["METRIC", metric.id], tableMetadata)
    }));
};

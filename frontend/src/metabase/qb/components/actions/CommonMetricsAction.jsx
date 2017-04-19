/* @flow */

import React from "react";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

import * as Card from "metabase/lib/card";
import * as Query from "metabase/lib/query/query";
import { chain } from "icepick";

export default ({ card, tableMetadata }: ClickActionProps): ClickAction[] => {
    return tableMetadata.metrics.slice(0, 5).map(metric => ({
        title: <span>View <strong>{metric.name}</strong></span>,
        card: () =>
            chain(
                Card.startNewCard("query", tableMetadata.db_id, metric.table_id)
            )
                .updateIn(["dataset_query", "query"], query =>
                    Query.addAggregation(query, ["METRIC", metric.id]))
                .assoc("display", "scalar")
                .value()
    }));
};

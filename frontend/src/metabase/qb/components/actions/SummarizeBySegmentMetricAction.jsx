/* @flow */

import React from "react";

import AggregationPopover from "metabase/qb/components/gui/AggregationPopover";

import * as Card from "metabase/meta/Card";
import Query from "metabase/lib/query";
import { summarize } from "metabase/qb/lib/actions";

import type {
    ClickAction,
    ClickActionProps,
    ClickActionPopoverProps
} from "metabase/meta/types/Visualization";

export default ({ card, tableMetadata }: ClickActionProps): ClickAction[] => {
    const query = Card.getQuery(card);
    if (!query) {
        return [];
    }

    return [
        {
            name: "summarize",
            title: "Summarize this segment",
            icon: "sum",
            // eslint-disable-next-line react/display-name
            popover: (
                { onChangeCardAndRun, onClose }: ClickActionPopoverProps
            ) => (
                <AggregationPopover
                    tableMetadata={tableMetadata}
                    customFields={Query.getExpressions(query)}
                    availableAggregations={tableMetadata.aggregation_options}
                    onCommitAggregation={aggregation => {
                        onChangeCardAndRun(
                            summarize(card, aggregation, tableMetadata)
                        );
                        onClose && onClose();
                    }}
                />
            )
        }
    ];
};

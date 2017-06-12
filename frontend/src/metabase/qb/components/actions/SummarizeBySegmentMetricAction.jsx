/* @flow */

import React from "react";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import AggregationPopover from "metabase/qb/components/gui/AggregationPopover";

import type {
    ClickAction,
    ClickActionProps,
    ClickActionPopoverProps
} from "metabase/meta/types/Visualization";

export default ({ question }: ClickActionProps): ClickAction[] => {
    const query = question.query();
    if (!(query instanceof StructuredQuery)) {
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
                    tableMetadata={query.table()}
                    customFields={query.expressions()}
                    availableAggregations={query.table().aggregation_options}
                    onCommitAggregation={aggregation => {
                        onChangeCardAndRun(
                            question.summarize(aggregation).card()
                        );
                        onClose && onClose();
                    }}
                />
            )
        }
    ];
};

/* @flow weak */

import React, { Component, PropTypes } from "react";

import AggregationPopover from "metabase/qb/components/gui/AggregationPopover";

import Query from "metabase/lib/query";
import { summarize } from "metabase/qb/lib/actions";

export default ({ card, tableMetadata }) => {
    return {
        title: "Summarize this segment",
        icon: "funnel", // FIXME: icon
        // eslint-disable-next-line react/display-name
        popover: ({ onChangeCardAndRun, onClose }) => (
            <AggregationPopover
                tableMetadata={tableMetadata}
                customFields={Query.getExpressions(card.dataset_query.query)}
                availableAggregations={tableMetadata.aggregation_options}
                onCommitAggregation={aggregation => {
                    onChangeCardAndRun(
                        summarize(card, aggregation, tableMetadata)
                    );
                    onClose && onClose();
                }}
            />
        )
    };
};

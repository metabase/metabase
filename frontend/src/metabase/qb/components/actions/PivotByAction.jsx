/* @flow weak */

import React from "react";

import BreakoutPopover from "metabase/qb/components/gui/BreakoutPopover";

import Query from "metabase/lib/query";
import { pivot } from "metabase/qb/lib/actions";

// PivotByAction displays a breakout picker, and optionally filters by the
// clicked dimesion values (and removes corresponding breakouts)
export default (name, icon, fieldFilter) => (
    { card, tableMetadata, clicked }
) => {
    // Click target types: metric value
    if (
        clicked &&
        (clicked.value === undefined || clicked.column.source !== "aggregation")
    ) {
        return;
    }

    let dimensions = (clicked && clicked.dimensions) || [];

    const breakouts = Query.getBreakouts(card.dataset_query.query);
    const usedFields = {};
    for (const breakout of breakouts) {
        usedFields[breakout] = true;
    }

    const fieldOptions = Query.getFieldOptions(
        tableMetadata.fields,
        true,
        fields => {
            fields = tableMetadata.breakout_options.validFieldsFilter(fields);
            if (fieldFilter) {
                fields = fields.filter(fieldFilter);
            }
            return fields;
        },
        usedFields
    );

    if (fieldOptions.count === 0) {
        return null;
    }

    return {
        title: (
            <span>
                Pivot by
                {" "}
                <span className="text-dark">{name.toLowerCase()}</span>
            </span>
        ),
        icon: icon,
        // eslint-disable-next-line react/display-name
        popover: ({ onChangeCardAndRun, onClose }) => (
            <BreakoutPopover
                tableMetadata={tableMetadata}
                fieldOptions={fieldOptions}
                customFieldOptions={Query.getExpressions(
                    card.dataset_query.query
                )}
                onCommitBreakout={breakout => {
                    onChangeCardAndRun(
                        pivot(card, breakout, tableMetadata, dimensions)
                    );
                    onClose && onClose();
                }}
            />
        )
    };
};

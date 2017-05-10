/* @flow */

import React from "react";

import BreakoutPopover from "metabase/qb/components/gui/BreakoutPopover";

import * as Card from "metabase/meta/Card";
import Query from "metabase/lib/query";
import { pivot } from "metabase/qb/lib/actions";

import type { Field } from "metabase/meta/types/Field";
import type {
    ClickAction,
    ClickActionProps,
    ClickActionPopoverProps
} from "metabase/meta/types/Visualization";

type FieldFilter = (field: Field) => boolean;

// PivotByAction displays a breakout picker, and optionally filters by the
// clicked dimesion values (and removes corresponding breakouts)
export default (name: string, icon: string, fieldFilter: FieldFilter) =>
    ({ card, tableMetadata, clicked }: ClickActionProps): ClickAction[] => {
        const query = Card.getQuery(card);

        // Click target types: metric value
        if (
            !query ||
            !tableMetadata ||
            (clicked &&
                (clicked.value === undefined ||
                    // $FlowFixMe
                    clicked.column.source !== "aggregation"))
        ) {
            return [];
        }

        let dimensions = (clicked && clicked.dimensions) || [];

        const breakouts = Query.getBreakouts(query);

        const usedFields = {};
        for (const breakout of breakouts) {
            usedFields[Query.getFieldTargetId(breakout)] = true;
        }

        const fieldOptions = Query.getFieldOptions(
            tableMetadata.fields,
            true,
            (fields: Field[]): Field[] => {
                fields = tableMetadata.breakout_options.validFieldsFilter(
                    fields
                );
                if (fieldFilter) {
                    fields = fields.filter(fieldFilter);
                }
                return fields;
            },
            usedFields
        );

        const customFieldOptions = Query.getExpressions(query);

        if (fieldOptions.count === 0) {
            return [];
        }

        return [
            {
                name: "pivot-by-" + name.toLowerCase(),
                section: "breakout",
                title: clicked
                    ? name
                    : <span>
                          Break out by
                          {" "}
                          <span className="text-dark">
                              {name.toLowerCase()}
                          </span>
                      </span>,
                icon: icon,
                // eslint-disable-next-line react/display-name
                popover: (
                    { onChangeCardAndRun, onClose }: ClickActionPopoverProps
                ) => (
                    <BreakoutPopover
                        tableMetadata={tableMetadata}
                        fieldOptions={fieldOptions}
                        customFieldOptions={customFieldOptions}
                        onCommitBreakout={breakout => {
                            onChangeCardAndRun(
                                pivot(card, breakout, tableMetadata, dimensions)
                            );
                        }}
                        onClose={onClose}
                    />
                )
            }
        ];
    };

/* @flow */

import React from "react";
import { jt } from "c-3po";
import BreakoutPopover from "metabase/qb/components/gui/BreakoutPopover";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import type { Field } from "metabase/meta/types/Field";
import type {
  ClickAction,
  ClickActionProps,
  ClickActionPopoverProps,
} from "metabase/meta/types/Visualization";

type FieldFilter = (field: Field) => boolean;

// PivotByAction displays a breakout picker, and optionally filters by the
// clicked dimesion values (and removes corresponding breakouts)
export default (name: string, icon: string, fieldFilter: FieldFilter) => ({
  question,
  clicked,
}: ClickActionProps): ClickAction[] => {
  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    return [];
  }

  // $FlowFixMe
  const tableMetadata: TableMetadata = query.table();

  // Click target types: metric value
  if (
    clicked &&
    (clicked.value === undefined ||
      // $FlowFixMe
      clicked.column.source !== "aggregation")
  ) {
    return [];
  }

  let dimensions = (clicked && clicked.dimensions) || [];

  const breakoutOptions = query.breakoutOptions(null, fieldFilter);
  if (breakoutOptions.count === 0) {
    return [];
  }
  return [
    {
      name: "pivot-by-" + name.toLowerCase(),
      section: "breakout",
      title: clicked ? (
        name
      ) : (
        <span>
          {jt`Break out by ${(
            <span className="text-dark">{name.toLowerCase()}</span>
          )}`}
        </span>
      ),
      icon: icon,
      // eslint-disable-next-line react/display-name
      popover: ({ onChangeCardAndRun, onClose }: ClickActionPopoverProps) => (
        <BreakoutPopover
          tableMetadata={tableMetadata}
          fieldOptions={breakoutOptions}
          onCommitBreakout={breakout => {
            const nextCard = question.pivot([breakout], dimensions).card();

            if (nextCard) {
              onChangeCardAndRun({ nextCard });
            }
          }}
          onClose={onClose}
        />
      ),
    },
  ];
};

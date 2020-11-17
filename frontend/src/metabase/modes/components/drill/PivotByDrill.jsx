/* @flow */

import React from "react";
import { jt } from "ttag";
import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import type { Field } from "metabase-types/types/Field";
import type {
  ClickAction,
  ClickActionProps,
  ClickActionPopoverProps,
} from "metabase-types/types/Visualization";

type FieldFilter = (field: Field) => boolean;

// PivotByDrill displays a breakout picker, and optionally filters by the
// clicked dimesion values (and removes corresponding breakouts)
export default (name: string, icon: string, fieldFilter: FieldFilter) => ({
  question,
  clicked,
}: ClickActionProps): ClickAction[] => {
  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    return [];
  }

  // Click target types: metric value
  if (
    clicked &&
    (clicked.value === undefined ||
      // $FlowFixMe
      clicked.column.source !== "aggregation")
  ) {
    return [];
  }

  const dimensions = (clicked && clicked.dimensions) || [];

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
          query={query}
          breakoutOptions={breakoutOptions}
          onChangeBreakout={breakout => {
            const nextCard = question.pivot([breakout], dimensions).card();
            if (nextCard) {
              onChangeCardAndRun({ nextCard });
            }
          }}
          onClose={onClose}
          alwaysExpanded
        />
      ),
    },
  ];
};

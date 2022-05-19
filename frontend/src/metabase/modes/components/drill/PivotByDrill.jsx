/* eslint-disable react/prop-types */
import React from "react";
import { jt } from "ttag";
import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";

// PivotByDrill displays a breakout picker, and optionally filters by the
// clicked dimension values (and removes corresponding breakouts)
export default (name, icon, fieldFilter) => ({ question, clicked }) => {
  const query = question.query();
  if (!question.isStructured() || !query.isEditable()) {
    return [];
  }

  // Click target types: metric value
  if (
    clicked &&
    (clicked.value === undefined || clicked.column.source !== "aggregation")
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
      buttonType: "token",
      title: clicked ? (
        name
      ) : (
        <span>
          {jt`Break out by ${(
            <span className="text-dark">{name.toLowerCase()}</span>
          )}`}
        </span>
      ),
      // eslint-disable-next-line react/display-name
      popover: ({ onChangeCardAndRun, onClose }) => (
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

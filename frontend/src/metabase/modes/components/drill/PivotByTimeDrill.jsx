/* eslint-disable react/prop-types */
import React from "react";
import { t, jt } from "ttag";
import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";
import { pivotByTimeDrill } from "metabase-lib/queries/drills/pivot-drill";

export default ({ question, clicked }) => {
  const drill = pivotByTimeDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  const { query, dimensions, breakoutOptions } = drill;

  return [
    {
      name: "pivot-by-time",
      section: "breakout",
      buttonType: "token",
      title: clicked ? (
        t`Time`
      ) : (
        <span>
          {jt`Break out by ${(<span className="text-dark">{t`time`}</span>)}`}
        </span>
      ),
      popover: function PivotDrillPopover({ onChangeCardAndRun, onClose }) {
        return (
          <BreakoutPopover
            query={query}
            breakoutOptions={breakoutOptions}
            onChangeBreakout={breakout => {
              const nextCard = question.pivot([breakout], dimensions).card();
              onChangeCardAndRun({ nextCard });
            }}
            onClose={onClose}
            alwaysExpanded
          />
        );
      },
    },
  ];
};

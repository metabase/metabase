/* eslint-disable react/prop-types */
import React from "react";
import { t, jt } from "ttag";
import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";
import { pivotByLocationDrill } from "metabase-lib/queries/drills/pivot-drill";

export default ({ question, clicked }) => {
  const drill = pivotByLocationDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  const { query, dimensions, breakoutOptions } = drill;

  return [
    {
      name: "pivot-by-location",
      section: "breakout",
      buttonType: "token",
      title: clicked ? (
        t`Location`
      ) : (
        <span>
          {jt`Break out by ${(
            <span className="text-dark">{t`location`}</span>
          )}`}
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

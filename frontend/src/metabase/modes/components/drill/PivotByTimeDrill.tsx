import React from "react";
import { t, jt } from "ttag";

import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";

import type { Card } from "metabase-types/api";
import { pivotByTimeDrill } from "metabase-lib/queries/drills/pivot-drill";

import type { ClickActionPopoverProps, Drill } from "../../types";

const PivotByTimeDrill: Drill = ({ question, clicked }) => {
  const drill = pivotByTimeDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  const { query, dimensions, breakoutOptions } = drill;

  const PivotDrillPopover = ({
    onChangeCardAndRun,
    onClose,
  }: ClickActionPopoverProps) => (
    <BreakoutPopover
      query={query}
      breakoutOptions={breakoutOptions}
      onChangeBreakout={breakout => {
        const nextCard = question.pivot([breakout], dimensions).card();

        // Casting deprecated `metabase-types/Card` to `metabase-types/api/card`
        onChangeCardAndRun({ nextCard: nextCard as Card });
      }}
      onClose={onClose}
      alwaysExpanded
    />
  );

  return [
    {
      name: "pivot-by-time",
      title: clicked ? (
        t`Time`
      ) : (
        <span>
          {jt`Break out by ${(<span className="text-dark">{t`time`}</span>)}`}
        </span>
      ),
      section: "breakout",
      buttonType: "token",
      popover: PivotDrillPopover,
    },
  ];
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PivotByTimeDrill;

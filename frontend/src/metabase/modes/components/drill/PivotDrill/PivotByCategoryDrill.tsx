import React from "react";
import { t } from "ttag";
import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";
import type { Card } from "metabase-types/api";
import { pivotByCategoryDrill } from "metabase-lib/queries/drills/pivot-drill";
import type { ClickActionPopoverProps, DrillOptions } from "../../../types";
import type { PivotByDrillOption } from "./types";

const PivotByCategoryDrill = ({
  question,
  clicked,
}: DrillOptions): PivotByDrillOption[] => {
  const drill = pivotByCategoryDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  const { query, dimensions, breakoutOptions } = drill;

  const PivotDrillPopover = ({
    onChangeCardAndRun,
    onClose,
  }: ClickActionPopoverProps) => {
    return (
      <BreakoutPopover
        query={query}
        breakoutOptions={breakoutOptions}
        width={350}
        onChangeBreakout={breakout => {
          const nextCard = question.pivot([breakout], dimensions).card();

          // Casting deprecated `metabase-types/Card` to `metabase-types/api/Card`
          onChangeCardAndRun({ nextCard: nextCard as Card });
        }}
        onClose={onClose}
        alwaysExpanded
      />
    );
  };

  return [
    {
      title: t`Category`,
      icon: "string",
      popover: PivotDrillPopover,
    },
  ];
};

export default PivotByCategoryDrill;

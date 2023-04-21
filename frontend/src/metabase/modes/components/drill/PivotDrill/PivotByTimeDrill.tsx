import React from "react";
import { t } from "ttag";
import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";
import type { Card } from "metabase-types/api";
import { pivotByTimeDrill } from "metabase-lib/queries/drills/pivot-drill";
import type { ClickActionPopoverProps, DrillOptions } from "../../../types";
import type { PivotByDrillOption } from "./types";

const PivotByTimeDrill = ({
  question,
  clicked,
}: DrillOptions): PivotByDrillOption[] => {
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
      width={350}
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
      title: t`Time`,
      icon: "calendar",
      popover: PivotDrillPopover,
    },
  ];
};

export default PivotByTimeDrill;

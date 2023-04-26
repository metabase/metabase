import React, { useState } from "react";
import { t } from "ttag";
import type {
  ClickActionPopoverProps,
  DrillOptions,
  PopoverClickAction,
} from "metabase/modes/types";
import { Card } from "metabase-types/api";
import { isNotNull } from "metabase/core/utils/types";
import { DimensionValue } from "metabase-types/types/Visualization";
import {
  pivotByCategoryDrill,
  pivotByLocationDrill,
  pivotByTimeDrill,
} from "metabase-lib/queries/drills/pivot-drill";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import DimensionOptions from "metabase-lib/DimensionOptions";
import PivotDrillPopover from "./PivotDrillPopover";
import {
  ActionIcon,
  ClickActionButton,
  StyledBreakoutPopover,
} from "./PivotDrillPopover.styled";

type PivotDrillTypeOption = {
  title: string;
  icon: "string" | "location" | "calendar";
  query: StructuredQuery;
  dimensions: DimensionValue[];
  breakoutOptions: DimensionOptions;
};

const PivotDrill = ({
  question,
  clicked,
}: DrillOptions): PopoverClickAction[] => {
  const categoryDrillOptions = pivotByCategoryDrill({ question, clicked });
  const locationDrillOptions = pivotByLocationDrill({ question, clicked });
  const timeDrillOptions = pivotByTimeDrill({ question, clicked });

  const drillOptions = [
    timeDrillOptions && {
      title: t`Time`,
      icon: "calendar" as const,
      ...timeDrillOptions,
    },
    locationDrillOptions && {
      title: t`Location`,
      icon: "location" as const,
      ...locationDrillOptions,
    },
    categoryDrillOptions && {
      title: t`Category`,
      icon: "string" as const,
      ...categoryDrillOptions,
    },
  ].filter(isNotNull);

  if (drillOptions.length === 0) {
    return [];
  }

  const Component = ({
    onChangeCardAndRun,
    onClose,
  }: ClickActionPopoverProps) => {
    const [activeDrillOption, setActiveDrillOption] =
      useState<PivotDrillTypeOption | null>(
        drillOptions.length === 1 ? drillOptions[0] : null,
      );

    if (activeDrillOption) {
      const { query, dimensions, breakoutOptions } = activeDrillOption;

      return (
        <StyledBreakoutPopover
          query={query}
          breakoutOptions={breakoutOptions}
          width={350}
          alwaysExpanded
          onChangeBreakout={breakout => {
            const nextCard = question.pivot([breakout], dimensions).card();

            // Casting deprecated `metabase-types/Card` to `metabase-types/api/Card`
            onChangeCardAndRun({ nextCard: nextCard as Card });
          }}
          onClose={onClose}
        />
      );
    }

    return (
      <PivotDrillPopover>
        {drillOptions.map(option => {
          const { icon, title } = option;

          return (
            <ClickActionButton
              key={icon}
              icon={<ActionIcon name={icon} />}
              small
              onClick={() => setActiveDrillOption(option)}
            >
              {title}
            </ClickActionButton>
          );
        })}
      </PivotDrillPopover>
    );
  };

  return [
    {
      name: "breakout-by",
      title: t`Break out by…`,
      section: "breakout",
      icon: "arrow_split",
      buttonType: "horizontal",
      popover: Component,
    },
  ];
};

export default PivotDrill;

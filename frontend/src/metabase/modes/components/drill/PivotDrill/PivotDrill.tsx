import React, { useState } from "react";
import { t } from "ttag";
import type {
  ClickActionPopoverProps,
  DrillOptions,
  PopoverClickAction,
} from "metabase/modes/types";
import { Card } from "metabase-types/api";
import { DimensionValue } from "metabase-types/types/Visualization";
import {
  pivotByCategoryDrill,
  pivotByLocationDrill,
  pivotByTimeDrill,
} from "metabase-lib/queries/drills/pivot-drill";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import DimensionOptions from "metabase-lib/DimensionOptions";
import DrillActionsListPopover from "../common/DrillActionsListPopover";
import {
  ActionIcon,
  ClickActionButton,
  StyledBreakoutPopover,
} from "../common/DrillActionsListPopover.styled";

type PivotDrillTypesConfig = {
  withCategory?: false;
  withLocation?: false;
  withTime?: false;
};

type PivotDrillTypeOption = {
  title: string;
  icon: "string" | "location" | "calendar";
  query: StructuredQuery;
  dimensions: DimensionValue[];
  breakoutOptions: DimensionOptions;
};

export const getPivotDrill =
  (options: PivotDrillTypesConfig = {}) =>
  ({ question, clicked }: DrillOptions): PopoverClickAction[] => {
    const {
      withCategory = true,
      withLocation = true,
      withTime = true,
    } = options;

    const drillOptions: PivotDrillTypeOption[] = [];

    if (withCategory) {
      const drillResults = pivotByCategoryDrill({ question, clicked });
      if (drillResults) {
        drillOptions.push({
          title: t`Category`,
          icon: "string",
          ...drillResults,
        });
      }
    }

    if (withLocation) {
      const drillResults = pivotByLocationDrill({ question, clicked });
      if (drillResults) {
        drillOptions.push({
          title: t`Location`,
          icon: "location",
          ...drillResults,
        });
      }
    }

    if (withTime) {
      const drillResults = pivotByTimeDrill({ question, clicked });
      if (drillResults) {
        drillOptions.push({
          title: t`Time`,
          icon: "calendar",
          ...drillResults,
        });
      }
    }

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
            width={256}
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
        <DrillActionsListPopover title={t`Break out by…`}>
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
        </DrillActionsListPopover>
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

const PivotDrill = getPivotDrill();

export default PivotDrill;

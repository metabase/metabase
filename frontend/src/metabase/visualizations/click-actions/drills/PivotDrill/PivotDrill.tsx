/* eslint-disable react/display-name */
import { t } from "ttag";
import type {
  ClickActionBase,
  ClickActionPopoverProps,
  ClickActionProps,
  PopoverClickAction,
} from "metabase/visualizations/click-actions/types";
import { Card } from "metabase-types/api";
import { ClickActionsView } from "metabase/visualizations/components/ClickActions";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import {
  pivotByCategoryDrill,
  pivotByLocationDrill,
  pivotByTimeDrill,
  PivotDrillResult,
} from "metabase-lib/queries/drills/pivot-drill";
import DimensionOptions from "metabase-lib/DimensionOptions";
import type { ClickObjectDimension } from "metabase-lib/queries/drills/types";
import { StyledBreakoutPopover } from "../../components/BreakoutPopover.styled";

type PivotDrillTypesConfig = {
  withCategory?: false;
  withLocation?: false;
  withTime?: false;
};

type PivotDrillTypeOption = PivotDrillResult & {
  name: string;
  title: string;
  icon: "string" | "location" | "calendar";
  query: StructuredQuery;
  dimensions: ClickObjectDimension[];
  breakoutOptions: DimensionOptions;
};

export const getPivotDrill =
  (options: PivotDrillTypesConfig = {}) =>
  ({ question, clicked }: ClickActionProps): PopoverClickAction[] => {
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
          name: "pivot-by-category",
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
          name: "pivot-by-location",
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
          name: "pivot-by-time",
          title: t`Time`,
          icon: "calendar",
          ...drillResults,
        });
      }
    }

    if (drillOptions.length === 0) {
      return [];
    }

    const getSingleDrillComponent =
      ({ query, dimensions, breakoutOptions }: PivotDrillResult) =>
      ({ onChangeCardAndRun, onClose }: ClickActionPopoverProps) => {
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
      };

    const baseClickAction: ClickActionBase = {
      name: "breakout-by",
      section: "breakout",
      buttonType: "horizontal",
    };

    const clickActions: PopoverClickAction[] = drillOptions.map(
      ({ name, title, icon, breakoutOptions, query, dimensions }) => ({
        ...baseClickAction,
        name,
        title,
        icon,
        type: "popover",
        section: "breakout-popover",
        popover: getSingleDrillComponent({
          query,
          dimensions,
          breakoutOptions,
        }),
      }),
    );

    const Component = ({ onClick }: ClickActionPopoverProps) => {
      return <ClickActionsView clickActions={clickActions} onClick={onClick} />;
    };

    return [
      {
        ...baseClickAction,
        icon: "arrow_split",
        title: t`Break out by…`,
        popover: clickActions.length > 1 ? Component : clickActions[0].popover,
      },
    ];
  };

export const PivotDrill = getPivotDrill();

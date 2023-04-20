import React from "react";
import { t } from "ttag";
import { ClickActionPopoverProps, Drill } from "metabase/modes/types";
import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";
import { Card } from "metabase-types/api";
import { ClickActionButton } from "metabase/visualizations/components/ChartClickActions/ChartClickActions.styled";
import Icon from "metabase/components/Icon/Icon";
import {
  pivotByCategoryDrill,
  pivotByLocationDrill,
  pivotByTimeDrill,
} from "metabase-lib/queries/drills/pivot-drill";
import Question from "metabase-lib/Question";

type PivotByDrillResult = {
  query;
  dimensions;
  breakoutOptions;
};

type PivotByDrillOption = {
  title: string;
  icon: string;
  popover: (props: ClickActionPopoverProps) => JSX.Element;
};

const generateDrillOptions = (
  question: Question,
  drills: {
    categoryDrill: PivotByDrillResult | null;
    locationDrill: PivotByDrillResult | null;
    timeDrill: PivotByDrillResult | null;
  },
) => {
  const options: PivotByDrillOption[] = [];
  const { timeDrill } = drills;

  if (timeDrill) {
    const { query, dimensions, breakoutOptions } = timeDrill;

    const PivotByTimeDrillPopover = ({
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

    options.push({
      title: t`Time`,
      icon: "arrow_split",
      popover: PivotByTimeDrillPopover,
    });
  }

  return options;
};

const PivotDrill: Drill = ({ question, clicked }) => {
  const categoryDrill = pivotByCategoryDrill({ question, clicked });
  const locationDrill = pivotByLocationDrill({ question, clicked });
  const timeDrill = pivotByTimeDrill({ question, clicked });

  if (!categoryDrill && !locationDrill && !timeDrill) {
    return [];
  }

  const options = generateDrillOptions(question, {
    categoryDrill,
    locationDrill,
    timeDrill,
  });

  const PivotDrillPopover = (props: ClickActionPopoverProps) => (
    <div className="Field-extra flex align-center">
      <span className="h5 text-light px1">{t`Break out by…`}</span>
      {options.map(({ title, icon }) => (
        <ClickActionButton
          key={icon}
          // onClick={/* close this and show popover */}
        >
          <Icon name={icon} />
          {title}
        </ClickActionButton>
      ))}
    </div>
  );

  return [
    {
      name: "pivot-by-category",
      title: t`Break out by…`,
      section: "breakout",
      icon: "arrow_split",
      buttonType: "horizontal",
      popover: PivotDrillPopover,
    },
  ];
};

export default PivotDrill;

import React, { useState } from "react";
import { t } from "ttag";
import { ClickActionPopoverProps, Drill } from "metabase/modes/types";

import type { PivotByDrillOption } from "./types";
import PivotByTimeDrill from "./PivotByTimeDrill";
import PivotByLocationDrill from "./PivotByLocationDrill";
import PivotByCategoryDrill from "./PivotByCategoryDrill";
import PivotDrillPopover from "./PivotDrillPopover";
import { ActionIcon, ClickActionButton } from "./PivotDrillPopover.styled";

const PivotDrill: Drill = ({ question, clicked }) => {
  const categoryDrillOptions = PivotByCategoryDrill({ question, clicked });
  const locationDrillOptions = PivotByLocationDrill({ question, clicked });
  const timeDrillOptions = PivotByTimeDrill({ question, clicked });

  const drillOptions = [
    ...timeDrillOptions,
    ...locationDrillOptions,
    ...categoryDrillOptions,
  ];

  if (!drillOptions.length) {
    return [];
  }

  const Component = (props: ClickActionPopoverProps) => {
    const [activeDrillOption, setActiveDrillOption] =
      useState<PivotByDrillOption | null>(null);

    const handleSelectDrill = (option: PivotByDrillOption) => {
      setActiveDrillOption(option);
    };

    if (activeDrillOption) {
      return <activeDrillOption.popover {...props} />;
    }

    return (
      <PivotDrillPopover>
        {drillOptions.map(option => {
          const { icon, title } = option;
          return (
            <ClickActionButton
              key={icon}
              icon={<ActionIcon name={icon} />}
              onClick={() => handleSelectDrill(option)}
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
      name: "pivot-by-category",
      title: t`Break out by…`,
      section: "breakout",
      icon: "arrow_split",
      buttonType: "horizontal",
      popover: Component,
    },
  ];
};

export default PivotDrill;

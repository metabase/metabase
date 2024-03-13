import { t } from "ttag";

import type {
  ClickActionPopoverProps,
  Drill,
} from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

import { CombineColumnsDrill } from "./components";

export const combineColumnsDrill: Drill<Lib.CombineColumnsDrillThruInfo> = ({
  query,
  stageIndex,
  drill,
  drillInfo,
  applyDrill,
}) => {
  const DrillPopover = ({ onClick }: ClickActionPopoverProps) => {
    return (
      <CombineColumnsDrill
        query={query}
        stageIndex={stageIndex}
        drillInfo={drillInfo}
      />
    );
  };

  return [
    {
      name: "combine",
      title: t`Combine columns`,
      section: "combine",
      icon: "add",
      buttonType: "horizontal",
      popover: DrillPopover,
    },
  ];
};

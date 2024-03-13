import { t } from "ttag";

import type {
  ClickActionPopoverProps,
  Drill,
} from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

export const combineColumnsDrill: Drill<Lib.CombineColumnsDrillThruInfo> = ({
  drill,
  drillInfo,
  applyDrill,
}) => {
  const DrillPopover = ({ onClick }: ClickActionPopoverProps) => {
    return <>Hello</>;
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

import { t } from "ttag";

import type { Drill } from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

export const columnExtractDrill: Drill<Lib.ColumnExtractDrillThruInfo> = ({
  query: _query,
  stageIndex: _stageIndex,
  drill,
}) => {
  const types = Lib.columnExtractTypes(drill);

  if (types.length === 0) {
    return [];
  }

  const DrillPopover = () => <>popover</>;

  return [
    {
      name: "extract",
      title: t`Extract day, month…`,
      section: "extract",
      icon: "extract",
      buttonType: "horizontal",
      popover: DrillPopover,
    },
  ];
};

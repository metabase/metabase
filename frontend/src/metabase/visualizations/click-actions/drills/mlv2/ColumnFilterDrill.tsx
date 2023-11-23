import { t } from "ttag";
import type { Drill } from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";
import { getFilterPopover } from "./utils";

export const ColumnFilterDrill: Drill<Lib.ColumnFilterDrillThruInfo> = ({
  question,
  drill,
}) => {
  const { query, column, stageIndex } = Lib.filterDrillDetails(drill);

  return [
    {
      name: "filter-column",
      section: "summarize",
      title: t`Filter by this column`,
      buttonType: "horizontal",
      icon: "filter",
      popover: getFilterPopover({ question, query, column, stageIndex }),
    },
  ];
};

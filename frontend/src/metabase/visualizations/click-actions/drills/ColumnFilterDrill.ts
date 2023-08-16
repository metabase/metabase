import { t } from "ttag";
import type { Drill } from "metabase/visualizations/click-actions/types";
import { getColumnFilterDrillPopover } from "metabase/visualizations/click-actions/components/ColumnFilterDrillPopover";
import { columnFilterDrill } from "metabase-lib/queries/drills/column-filter-drill";

export const ColumnFilterDrill: Drill = ({ question, clicked }) => {
  const drill = columnFilterDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  return [
    {
      name: "filter-column",
      section: "summarize",
      title: t`Filter by this column`,
      buttonType: "horizontal",
      icon: "filter",
      popover: getColumnFilterDrillPopover(drill),
    },
  ];
};

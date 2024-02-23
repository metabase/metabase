import { t } from "ttag";

import { getColumnFilterDrillPopover } from "metabase/visualizations/click-actions/components/ColumnFilterDrillPopover";
import type { LegacyDrill } from "metabase/visualizations/types";
import { columnFilterDrill } from "metabase-lib/queries/drills/column-filter-drill";

export const ColumnFilterDrill: LegacyDrill = ({ question, clicked }) => {
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

import { t } from "ttag";
import { getIn } from "icepick";

import type {
  ClickBehaviorType,
  DashboardOrderedCard,
  DatasetColumn,
} from "metabase-types/api";
import { hasActionsMenu } from "metabase/lib/click-behavior";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";

type ClickBehaviorOption = {
  value: ClickBehaviorType | "menu";
  icon: string;
};

export const clickBehaviorOptions: ClickBehaviorOption[] = [
  { value: "menu", icon: "popover" },
  { value: "link", icon: "link" },
  { value: "crossfilter", icon: "filter" },
];

export function getClickBehaviorOptionName(
  value: ClickBehaviorType | "menu",
  dashcard: DashboardOrderedCard,
) {
  if (value === "menu") {
    return hasActionsMenu(dashcard)
      ? t`Open the Metabase drill-through menu`
      : t`Do nothing`;
  }
  if (value === "link") {
    return t`Go to a custom destination`;
  }
  if (value === "crossfilter") {
    return t`Update a dashboard filter`;
  }
  if (value === "action") {
    return t`Perform action`;
  }
  return t`Unknown`;
}
export function getClickBehaviorForColumn(
  dashcard: DashboardOrderedCard,
  column: DatasetColumn,
) {
  return getIn(dashcard, [
    "visualization_settings",
    "column_settings",
    getColumnKey(column),
    "click_behavior",
  ]);
}

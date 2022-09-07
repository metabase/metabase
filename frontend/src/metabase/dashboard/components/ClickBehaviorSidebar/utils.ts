import { t } from "ttag";
import { getIn } from "icepick";

import { hasActionsMenu } from "metabase/lib/click-behavior";
import { keyForColumn } from "metabase/lib/dataset";

import type {
  ClickBehaviorType,
  DashboardOrderedCard,
} from "metabase-types/api";
import type { Column } from "metabase-types/types/Dataset";

type ClickBehaviorOption = {
  value: ClickBehaviorType | "menu";
  icon: string;
};

export const clickBehaviorOptions: ClickBehaviorOption[] = [
  { value: "menu", icon: "popover" },
  { value: "link", icon: "link" },
  { value: "crossfilter", icon: "filter" },
  // { value: "action", icon: "play" },
];

export function getClickBehaviorOptionName(
  value: ClickBehaviorType | "menu",
  dashcard: DashboardOrderedCard,
) {
  if (value === "menu") {
    return hasActionsMenu(dashcard)
      ? t`Open the Metabase actions menu`
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
  column: Column,
) {
  return getIn(dashcard, [
    "visualization_settings",
    "column_settings",
    keyForColumn(column),
    "click_behavior",
  ]);
}

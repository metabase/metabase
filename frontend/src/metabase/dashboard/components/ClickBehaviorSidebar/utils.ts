import { getIn } from "icepick";

import type {
  ClickBehaviorType,
  DashboardCard,
  DatasetColumn,
} from "metabase-types/api";
import type { IconName } from "metabase/core/components/Icon";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";

type ClickBehaviorOption = {
  value: ClickBehaviorType | "menu";
  icon: IconName;
};

export const clickBehaviorOptions: ClickBehaviorOption[] = [
  { value: "menu", icon: "popover" },
  { value: "link", icon: "link" },
  { value: "crossfilter", icon: "filter" },
];

export function getClickBehaviorForColumn(
  dashcard: DashboardCard,
  column: DatasetColumn,
) {
  return getIn(dashcard, [
    "visualization_settings",
    "column_settings",
    getColumnKey(column),
    "click_behavior",
  ]);
}

import { getIn } from "icepick";

import type { IconName } from "metabase/core/components/Icon";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import type {
  ClickBehaviorType,
  DashboardCard,
  DatasetColumn,
} from "metabase-types/api";

type ClickBehaviorOption = {
  value: ClickBehaviorType;
  icon: IconName;
};

export const clickBehaviorOptions: ClickBehaviorOption[] = [
  { value: "actionMenu", icon: "popover" },
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

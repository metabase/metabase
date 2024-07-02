import { getIn } from "icepick";

import type { IconName } from "metabase/ui";
import { getColumnKey } from "metabase-lib/v1/queries/utils/get-column-key";
import type {
  ClickBehaviorType,
  QuestionDashboardCard,
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
  dashcard: QuestionDashboardCard,
  column: DatasetColumn,
) {
  return getIn(dashcard, [
    "visualization_settings",
    "column_settings",
    getColumnKey(column),
    "click_behavior",
  ]);
}

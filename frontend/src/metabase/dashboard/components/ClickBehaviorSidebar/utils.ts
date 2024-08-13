import type { IconName } from "metabase/ui";
import { getColumnSettings } from "metabase-lib/v1/queries/utils/column-key";
import type {
  ClickBehaviorType,
  DatasetColumn,
  DashboardCard,
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
  if (dashcard.visualization_settings) {
    const columnSettings = getColumnSettings(
      dashcard.visualization_settings,
      column,
    );
    return columnSettings?.click_behavior;
  }
}

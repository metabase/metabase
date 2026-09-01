import { t } from "ttag";

import { ChartSettingSeriesOrder } from "metabase/visualizations/components/settings/ChartSettingSeriesOrder";
import {
  type TreemapGroupsPickerProps,
  getTreemapChartColumns,
} from "metabase/viz-core";
import type { TreemapRow } from "metabase-types/api";

export function TreemapGroupsPicker({
  rawSeries,
  settings,
  onChangeSettings,
  onShowWidget,
}: TreemapGroupsPickerProps) {
  const treemapRows = settings["treemap.rows"];

  if (treemapRows == null || treemapRows.length === 0) {
    return null;
  }

  const isTwoLevel =
    getTreemapChartColumns(rawSeries[0]?.data?.cols ?? [], settings)
      ?.subGrouping != null;

  const handleChangeSeriesColor = (groupKey: string, color: string) =>
    onChangeSettings({
      "treemap.rows": treemapRows.map((row) => {
        if (row.key !== groupKey) {
          return row;
        }
        return { ...row, color, defaultColor: false };
      }),
    });

  return (
    <ChartSettingSeriesOrder
      value={treemapRows}
      series={rawSeries}
      onChange={(rows) =>
        // Unjustified type cast. FIXME
        onChangeSettings({ "treemap.rows": rows as TreemapRow[] })
      }
      onChangeSeriesColor={handleChangeSeriesColor}
      onSortEnd={() => {}}
      onShowWidget={onShowWidget}
      hasEditSettings
      isSortable={false}
      accentColorOptions={
        isTwoLevel
          ? { main: true, light: false, dark: false, harmony: false }
          : undefined
      }
      addButtonLabel={t`Add another group`}
      searchPickerPlaceholder={t`Select a group`}
    />
  );
}

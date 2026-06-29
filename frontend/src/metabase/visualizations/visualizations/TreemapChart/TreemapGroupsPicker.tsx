import { t } from "ttag";

import { ChartSettingSeriesOrder } from "metabase/visualizations/components/settings/ChartSettingSeriesOrder";
import { getTreemapChartColumns } from "metabase/visualizations/echarts/graph/treemap/model/data";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RawSeries, TreemapRow } from "metabase-types/api";

export type TreemapGroupsPickerProps = {
  rawSeries: RawSeries;
  settings: ComputedVisualizationSettings;
  onChangeSettings: (newSettings: ComputedVisualizationSettings) => void;
  onShowWidget: (
    widget: { id?: string; props?: { seriesKey: string } },
    ref: HTMLElement | undefined,
  ) => void;
};

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

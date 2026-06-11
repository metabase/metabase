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

/**
 * The per-group list under the Grouping picker: color swatch + name + a "…"
 * rename popover + an X that removes the group from the chart (it can be added
 * back via the picker that appears once something is removed). Unlike pie's
 * rows there is no reordering — tiles auto-sort by value — so drag handles are
 * disabled.
 */
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

  // In a 2-level treemap the sub-group tiles render as derived shades of the
  // parent hue, so the picker offers only the main accent row (a light/dark
  // shade as the base would collide with the derived shades). A 1-level
  // treemap has no derived shades, so the full palette is offered.
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

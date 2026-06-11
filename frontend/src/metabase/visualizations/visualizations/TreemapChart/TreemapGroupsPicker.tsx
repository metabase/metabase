import { ChartSettingSeriesOrder } from "metabase/visualizations/components/settings/ChartSettingSeriesOrder";
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
 * rename popover for each top-level group. Unlike pie's rows there is no
 * reordering (tiles auto-sort by value) and no hiding, so drag handles and the
 * remove button are disabled.
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

  const items = treemapRows.map((row) => ({ ...row, enabled: true }));

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
      value={items}
      series={rawSeries}
      onChange={(rows) =>
        onChangeSettings({
          "treemap.rows": (rows as Array<TreemapRow & { enabled: boolean }>).map(
            ({ enabled: _enabled, ...row }) => row,
          ),
        })
      }
      onChangeSeriesColor={handleChangeSeriesColor}
      onSortEnd={() => {}}
      onShowWidget={onShowWidget}
      hasEditSettings
      isSortable={false}
      isRemovable={false}
    />
  );
}

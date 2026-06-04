import { useMemo } from "react";

import { color } from "metabase/ui/colors";
import {
  ChartSettingSeriesOrder,
  type SortableChartSettingOrderedItem,
  type SortableItem,
} from "metabase/visualizations/components/settings/ChartSettingSeriesOrder";
import {
  createHexToAccentNumberMap,
  getPickerColorAlias,
} from "metabase/visualizations/echarts/pie/util/colors";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { PieRow, RawSeries } from "metabase-types/api";

export function PieRowsPicker({
  rawSeries,
  settings,
  numRings,
  onChangeSettings,
  onShowWidget,
}: {
  rawSeries: RawSeries;
  settings: ComputedVisualizationSettings;
  numRings: number;
  onChangeSettings: (newSettings: ComputedVisualizationSettings) => void;
  onShowWidget: (widget: any, ref: any) => void;
}) {
  const pieRows = settings["pie.rows"];
  const hasMultipleRings = numRings > 1;

  const hexToAccentNumberMap = useMemo(() => createHexToAccentNumberMap(), []);

  if (pieRows == null) {
    return null;
  }

  const handleGetColorForPicker = ({
    color: hexColor,
  }: SortableChartSettingOrderedItem) => {
    if (!hasMultipleRings || hexColor == null) {
      return hexColor;
    }
    const accentKey = hexToAccentNumberMap.get(hexColor);
    if (accentKey == null) {
      return hexColor;
    }
    return color(getPickerColorAlias(accentKey));
  };

  const onChangeSeriesColor = (sliceKey: string, color: string) =>
    onChangeSettings({
      "pie.rows": pieRows.map((row) => {
        if (row.key !== sliceKey) {
          return row;
        }
        return { ...row, color, defaultColor: false };
      }),
    });

  const toPieRows = (rows: SortableItem[]): PieRow[] =>
    rows.map((row) => {
      const existingRow = pieRows.find((pieRow) => pieRow.key === row.key);

      return {
        key: row.key,
        name: row.name,
        originalName: existingRow?.originalName ?? row.name,
        color: row.color ?? existingRow?.color ?? "",
        defaultColor: existingRow?.defaultColor ?? true,
        enabled: row.enabled,
        hidden: row.hidden ?? existingRow?.hidden ?? false,
        isOther: existingRow?.isOther ?? false,
      };
    });

  const onSortEnd = (newPieRows: SortableItem[]) =>
    onChangeSettings({
      "pie.sort_rows": false,
      "pie.rows": toPieRows(newPieRows),
    });

  return (
    <ChartSettingSeriesOrder
      value={pieRows}
      series={rawSeries}
      onChangeSeriesColor={onChangeSeriesColor}
      onSortEnd={onSortEnd}
      onChange={(rows) => onChangeSettings({ "pie.rows": toPieRows(rows) })}
      onShowWidget={onShowWidget}
      hasEditSettings
      accentColorOptions={
        numRings > 1
          ? { dark: true, main: false, light: false, harmony: false }
          : undefined
      }
      getItemColor={handleGetColorForPicker}
    />
  );
}

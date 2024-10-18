import { useMemo } from "react";

import { color } from "metabase/lib/colors";
import {
  ChartSettingSeriesOrder,
  type SortableChartSettingOrderedItem,
} from "metabase/visualizations/components/settings/ChartSettingSeriesOrder";
import type { PieRow } from "metabase/visualizations/echarts/pie/model/types";
import {
  createHexToAccentNumberMap,
  getPickerColorAlias,
} from "metabase/visualizations/echarts/pie/util/colors";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

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
    const accentNumber = hexToAccentNumberMap.get(hexColor);
    if (accentNumber == null) {
      return hexColor;
    }
    return color(getPickerColorAlias(accentNumber));
  };

  const onChangeSeriesColor = (sliceKey: string, color: string) =>
    onChangeSettings({
      "pie.rows": pieRows.map(row => {
        if (row.key !== sliceKey) {
          return row;
        }
        return { ...row, color, defaultColor: false };
      }),
    });

  const onSortEnd = (newPieRows: SortableChartSettingOrderedItem[]) =>
    onChangeSettings({
      "pie.sort_rows": false,
      "pie.rows": newPieRows as PieRow[],
    });

  return (
    <ChartSettingSeriesOrder
      value={pieRows}
      series={rawSeries}
      onChangeSeriesColor={onChangeSeriesColor}
      onSortEnd={onSortEnd}
      onChange={rows => onChangeSettings({ "pie.rows": rows as PieRow[] })}
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

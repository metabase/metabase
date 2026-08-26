import { useMemo } from "react";

import { color } from "metabase/ui/colors";
import { ChartSettingSeriesOrder } from "metabase/visualizations/components/settings/ChartSettingSeriesOrder";
import {
  type ChartSettingOrderedItem,
  type ComputedVisualizationSettings,
  createHexToAccentNumberMap,
  getPickerColorAlias,
  withColorName,
} from "metabase/viz-core";
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
  }: ChartSettingOrderedItem) => {
    if (!hasMultipleRings || hexColor == null) {
      return hexColor;
    }
    const accentKey = hexToAccentNumberMap.get(hexColor);
    if (accentKey == null) {
      return hexColor;
    }
    return color(getPickerColorAlias(accentKey));
  };

  const onChangeSeriesColor = (
    sliceKey: string,
    color: string,
    colorName?: string,
  ) =>
    onChangeSettings({
      "pie.rows": pieRows.map((row) => {
        if (row.key !== sliceKey) {
          return row;
        }
        return withColorName({ ...row, color, defaultColor: false }, colorName);
      }),
    });

  const onSortEnd = (newPieRows: ChartSettingOrderedItem[]) =>
    onChangeSettings({
      "pie.sort_rows": false,
      // Unjustified type cast. FIXME
      "pie.rows": newPieRows as PieRow[],
    });

  return (
    <ChartSettingSeriesOrder
      value={pieRows}
      series={rawSeries}
      onChangeSeriesColor={onChangeSeriesColor}
      onSortEnd={onSortEnd}
      // Unjustified type cast. FIXME
      onChange={(rows) => onChangeSettings({ "pie.rows": rows as PieRow[] })}
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

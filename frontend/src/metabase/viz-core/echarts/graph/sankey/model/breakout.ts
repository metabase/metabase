import _ from "underscore";

import { getColorsForValues } from "metabase/ui/colors/charts";
import { formatValue } from "metabase/value-formatting";
import type { RawSeries, RowValue } from "metabase-types/api";

import type { ComputedVisualizationSettings } from "../../../../types";

export type SankeyBreakout = {
  columnIndex: number;
  getLabel: (value: RowValue) => string;
  getColor: (value: RowValue) => string;
};

/**
 * The column that splits each flow into one per value, from
 * `sankey.breakout`. Undefined when it's unset or not in the result.
 */
export const getSankeyBreakout = (
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
): SankeyBreakout | undefined => {
  const columnName = settings["sankey.breakout"];
  const [
    {
      data: { cols, rows },
    },
  ] = rawSeries;
  const columnIndex = cols.findIndex((col) => col.name === columnName);
  if (columnName == null || columnIndex < 0) {
    return undefined;
  }

  const columnSettings = settings.column?.(cols[columnIndex]) ?? {};
  const getLabel = (value: RowValue) =>
    String(formatValue(value, columnSettings));
  const colors = getColorsForValues(
    _.uniq(rows.map((row) => getLabel(row[columnIndex]))),
    settings["sankey.breakout_colors"],
  );

  return {
    columnIndex,
    getLabel,
    getColor: (value) => colors[getLabel(value)],
  };
};

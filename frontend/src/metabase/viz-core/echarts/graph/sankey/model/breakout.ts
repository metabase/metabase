import _ from "underscore";

import { getColorsForValues } from "metabase/ui/colors/charts";
import type { RawSeries, RowValue } from "metabase-types/api";

import type { ComputedVisualizationSettings } from "../../../../types";
import { formatBreakoutValue } from "../../../cartesian/model/series";

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

  // Labeled like a cartesian chart's breakout series, "(empty)" included.
  const getLabel = (value: RowValue) =>
    formatBreakoutValue(value, cols[columnIndex]);
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

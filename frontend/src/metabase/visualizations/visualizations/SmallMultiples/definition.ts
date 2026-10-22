import { t } from "ttag";

import { MAX_SERIES, type VisualizationDefinition } from "metabase/viz-core";

/**
 * A chart per value of one column, one above another, sharing their axes.
 * For charts whose dimensions are both in use, like stacked bars over time.
 * Hidden from the chart type picker: product analytics sets it up.
 */
export const SMALL_MULTIPLES_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Small multiples`,
  identifier: "small_multiples",
  iconName: "bar",
  hidden: true,
  minSize: { width: 6, height: 4 },
  defaultSize: { width: 12, height: 8 },
  isSensible: () => false,
  // A chart per value can't take more than a chart's worth of series.
  checkRenderable: ([{ data }], settings) => {
    const columnIndex = data.cols.findIndex(
      (col) => col.name === settings["small_multiples.column"],
    );
    const chartCount =
      columnIndex >= 0
        ? new Set(data.rows.map((row) => row[columnIndex])).size
        : 1;
    if (chartCount > MAX_SERIES) {
      throw new Error(
        t`This chart type doesn't support more than ${MAX_SERIES} series of data.`,
      );
    }
  },
  settings: {
    // The column with each row's chart; without it, there's one chart.
    "small_multiples.column": {
      getDefault: () => null,
    },
    // How each chart draws, with the card's other settings.
    "small_multiples.display": {
      getDefault: () => "bar",
    },
  },
};

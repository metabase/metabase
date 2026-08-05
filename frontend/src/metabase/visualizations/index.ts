import { t } from "ttag";
import _ from "underscore";

import type {
  DatasetData,
  RawSeries,
  Series,
  TransformedSeries,
  VisualizationDisplay,
} from "metabase-types/api";

import visualizations, { getVisualizationRaw } from "./lib/registry";
import type { RemappingHydratedDatasetColumn } from "./types";

export {
  type RegisteredVisualization,
  canSavePng,
  getDefaultSize,
  getIconForVisualizationType,
  getMaxDimensionsSupported,
  getMaxMetricsSupported,
  getSensibleDisplays,
  getSettingWidgetComponent,
  getVisualization,
  getVisualizationRaw,
  registerSettingWidgets,
  registerVisualization,
  setDefaultVisualization,
} from "./lib/registry";

export function getVisualizationTransformed(
  series: RawSeries | TransformedSeries,
) {
  // don't transform if we don't have the data
  if (
    _.any(series, (s) => s.data == null) ||
    _.any(series, (s) => s.error != null)
  ) {
    return {
      series,
      visualization: getVisualizationRaw(series),
    };
  }

  // if a visualization has a transformSeries function, do the transformation until it returns the same visualization / series
  let visualization, lastSeries;
  do {
    visualization = visualizations.get(series[0].card.display);
    if (!visualization) {
      throw new Error(t`No visualization for ${series[0].card.display}`);
    }
    lastSeries = series;
    if (typeof visualization.transformSeries === "function") {
      series = visualization.transformSeries(series);
    }
    if (series !== lastSeries) {
      series = Object.assign([...series], { _raw: lastSeries });
    }
  } while (series !== lastSeries);

  return { series, visualization };
}

export const extractRemappings = (series: Series) => {
  const se = series.map((s) => ({
    ...s,
    data: s.data && extractRemappedColumns(s.data),
  }));
  return se;
};

export function isCartesianChart(display: VisualizationDisplay) {
  const visualization = visualizations.get(display);
  const settingNames = Object.keys(visualization?.settings ?? {});
  return (
    settingNames.includes("graph.dimensions") &&
    settingNames.includes("graph.metrics")
  );
}

// removes columns with `remapped_from` property and adds a `remapping` to the appropriate column
export const extractRemappedColumns = (data: DatasetData) => {
  const cols: RemappingHydratedDatasetColumn[] = data.cols.map((col) => ({
    ...col,
    remapped_from_index:
      col.remapped_from != null
        ? _.findIndex(data.cols, (c) => c.name === col.remapped_from)
        : undefined,
    remapping: col.remapped_to != null ? new Map() : undefined,
  }));

  const rows = data.rows.map((row) =>
    row.filter((value, colIndex) => {
      const col = cols[colIndex];
      if (col.remapped_from != null) {
        if (
          col.remapped_from_index == null ||
          !cols[col.remapped_from_index] ||
          !cols[col.remapped_from_index].remapping
        ) {
          console.warn("Invalid remapped_from", col);
          return true;
        }
        cols[col.remapped_from_index].remapped_to_column = col;
        cols[col.remapped_from_index].remapping?.set(
          row[col.remapped_from_index],
          row[colIndex],
        );
        return false;
      } else {
        return true;
      }
    }),
  );
  return {
    ...data,
    rows,
    cols: cols.filter((col) => col.remapped_from == null),
  };
};

// eslint-disable-next-line import/no-default-export
export default visualizations;

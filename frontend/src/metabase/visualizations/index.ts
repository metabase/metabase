import { t } from "ttag";
import _ from "underscore";
import type {
  DatasetData,
  Series,
  TransformedSeries,
} from "metabase-types/api";
import type { Visualization } from "./types/visualization";
import type { RemappingHydratedDatasetColumn } from "./types";

const visualizations = new Map<string, Visualization>();
const aliases = new Map<string, Visualization>();
visualizations.get = function (key) {
  return (
    Map.prototype.get.call(this, key) ||
    aliases.get(key) ||
    defaultVisualization
  );
};

export function getSensibleDisplays(data: DatasetData) {
  return Array.from(visualizations)
    .filter(
      ([, viz]) =>
        // don't rule out displays if there's no data
        data.rows.length <= 1 || (viz.isSensible && viz.isSensible(data)),
    )
    .map(([display]) => display);
}

let defaultVisualization: Visualization;
export function setDefaultVisualization(visualization: Visualization) {
  defaultVisualization = visualization;
}

export function registerVisualization(visualization: Visualization) {
  if (visualization == null) {
    throw new Error(t`Visualization is null`);
  }
  const identifier = visualization.identifier;
  if (identifier == null) {
    throw new Error(
      t`Visualization must define an 'identifier' static variable: ` +
        visualization.name,
    );
  }
  if (visualizations.has(identifier)) {
    throw new Error(
      t`Visualization with that identifier is already registered: ` +
        visualization.name,
    );
  }
  visualizations.set(identifier, visualization);
  for (const alias of visualization.aliases || []) {
    aliases.set(alias, visualization);
  }
}

export function getVisualizationRaw(series: Series) {
  return visualizations.get(series[0].card.display);
}

export function getVisualizationTransformed(series: TransformedSeries) {
  // don't transform if we don't have the data
  if (
    _.any(series, s => s.data == null) ||
    _.any(series, s => s.error != null)
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

export function getIconForVisualizationType(display: string) {
  const viz = visualizations.get(display);
  return viz?.iconName ?? "unknown";
}

export const extractRemappings = (series: Series) => {
  const se = series.map(s => ({
    ...s,
    data: s.data && extractRemappedColumns(s.data),
  }));
  return se;
};

export function getMaxMetricsSupported(display: string) {
  const visualization = visualizations.get(display);
  return visualization?.maxMetricsSupported || Infinity;
}

export function getMaxDimensionsSupported(display: string) {
  const visualization = visualizations.get(display);
  return visualization?.maxDimensionsSupported || 2;
}

export function canSavePng(display: string) {
  const visualization = visualizations.get(display);
  return visualization?.canSavePng ?? true;
}

// removes columns with `remapped_from` property and adds a `remapping` to the appropriate column
export const extractRemappedColumns = (data: DatasetData) => {
  const cols: RemappingHydratedDatasetColumn[] = data.cols.map(col => ({
    ...col,
    remapped_from_index:
      col.remapped_from != null
        ? _.findIndex(data.cols, c => c.name === col.remapped_from)
        : undefined,
    remapping: col.remapped_to != null ? new Map() : undefined,
  }));

  const rows = data.rows.map(row =>
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
    cols: cols.filter(col => col.remapped_from == null),
  };
};

// eslint-disable-next-line import/no-default-export
export default visualizations;

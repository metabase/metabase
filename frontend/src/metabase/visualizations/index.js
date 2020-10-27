/* @flow weak */

import { t } from "ttag";
import _ from "underscore";

import type { Series } from "metabase-types/types/Visualization";

const visualizations = new Map();
const aliases = new Map();
// $FlowFixMe
visualizations.get = function(key) {
  return (
    Map.prototype.get.call(this, key) ||
    aliases.get(key) ||
    defaultVisualization
  );
};

export function getSensibleDisplays(data) {
  return Array.from(visualizations)
    .filter(
      ([, viz]) =>
        // don't rule out displays if there's no data
        data.rows.length <= 1 || (viz.isSensible && viz.isSensible(data)),
    )
    .map(([display]) => display);
}

let defaultVisualization;
export function setDefaultVisualization(visualization) {
  defaultVisualization = visualization;
}

export function registerVisualization(visualization) {
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
  return {
    series: series,
    visualization: visualizations.get(series[0].card.display),
  };
}

export function getVisualizationTransformed(series: Series) {
  // don't transform if we don't have the data
  if (_.any(series, s => s.data == null)) {
    return getVisualizationRaw(series);
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
      series = [...series];
      // $FlowFixMe
      series._raw = lastSeries;
    }
  } while (series !== lastSeries);

  return { series, visualization };
}

export function getIconForVisualizationType(display) {
  const viz = visualizations.get(display);
  return viz && viz.iconName;
}

export const extractRemappings = series => {
  const se = series.map(s => ({
    ...s,
    data: s.data && extractRemappedColumns(s.data),
  }));
  return se;
};

// removes columns with `remapped_from` property and adds a `remapping` to the appropriate column
const extractRemappedColumns = data => {
  const cols = data.cols.map(col => ({
    ...col,
    remapped_from_index:
      col.remapped_from &&
      _.findIndex(data.cols, c => c.name === col.remapped_from),
    remapping: col.remapped_to && new Map(),
  }));

  const rows = data.rows.map((row, rowIndex) =>
    row.filter((value, colIndex) => {
      const col = cols[colIndex];
      if (col.remapped_from != null) {
        if (
          !cols[col.remapped_from_index] ||
          !cols[col.remapped_from_index].remapping
        ) {
          console.warn("Invalid remapped_from", col);
          return true;
        }
        cols[col.remapped_from_index].remapped_to_column = col;
        cols[col.remapped_from_index].remapping.set(
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

export default visualizations;

/* @flow weak */

import Scalar from "./visualizations/Scalar.jsx";
import Progress from "./visualizations/Progress.jsx";
import Table from "./visualizations/Table.jsx";
import Text from "./visualizations/Text.jsx";
import LineChart from "./visualizations/LineChart.jsx";
import BarChart from "./visualizations/BarChart.jsx";
import RowChart from "./visualizations/RowChart.jsx";
import PieChart from "./visualizations/PieChart.jsx";
import AreaChart from "./visualizations/AreaChart.jsx";
import MapViz from "./visualizations/Map.jsx";
import ScatterPlot from "./visualizations/ScatterPlot.jsx";
import Funnel from "./visualizations/Funnel.jsx";
import ObjectDetail from "./visualizations/ObjectDetail.jsx";
import { t } from "c-3po";
import _ from "underscore";

import type { Series } from "metabase/meta/types/Visualization";

const visualizations = new Map();
const aliases = new Map();
// $FlowFixMe
visualizations.get = function(key) {
  return Map.prototype.get.call(this, key) || aliases.get(key) || Table;
};

export function registerVisualization(visualization) {
  if (visualization == null) {
    throw new Error(t`Visualization is null`);
  }
  let identifier = visualization.identifier;
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
  for (let alias of visualization.aliases || []) {
    aliases.set(alias, visualization);
  }
}

export function getVisualizationRaw(series: Series) {
  return {
    series: series,
    CardVisualization: visualizations.get(series[0].card.display),
  };
}

export function getVisualizationTransformed(series: Series) {
  // don't transform if we don't have the data
  if (_.any(series, s => s.data == null)) {
    return getVisualizationRaw(series);
  }

  // if a visualization has a transformSeries function, do the transformation until it returns the same visualization / series
  let CardVisualization, lastSeries;
  do {
    CardVisualization = visualizations.get(series[0].card.display);
    if (!CardVisualization) {
      throw new Error(t`No visualization for ${series[0].card.display}`);
    }
    lastSeries = series;
    if (typeof CardVisualization.transformSeries === "function") {
      series = CardVisualization.transformSeries(series);
    }
    if (series !== lastSeries) {
      series = [...series];
      // $FlowFixMe
      series._raw = lastSeries;
    }
  } while (series !== lastSeries);

  return { series, CardVisualization };
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

registerVisualization(Scalar);
registerVisualization(Progress);
registerVisualization(Table);
registerVisualization(Text);
registerVisualization(LineChart);
registerVisualization(AreaChart);
registerVisualization(BarChart);
registerVisualization(RowChart);
registerVisualization(ScatterPlot);
registerVisualization(PieChart);
registerVisualization(MapViz);
registerVisualization(Funnel);
registerVisualization(ObjectDetail);

export default visualizations;

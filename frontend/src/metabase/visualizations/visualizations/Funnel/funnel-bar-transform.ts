import { formatValue } from "metabase/lib/formatting/value";
import type { TransformSeries } from "metabase/visualizations/components/TransformedVisualization";
import type { RawSeries } from "metabase-types/api";

export const funnelToBarTransform: TransformSeries = (rawSeries, settings) => {
  const [series] = rawSeries;
  const {
    card,
    data: { cols, rows },
  } = series;

  const dimensionIndex = cols.findIndex(
    col => col.name === settings["funnel.dimension"],
  );
  const metricIndex = cols.findIndex(
    col => col.name === settings["funnel.metric"],
  );

  return rows.map((row, index) => {
    return {
      card: {
        ...card,
        id: index,
        name: formatValue(row[dimensionIndex], {
          column: cols[dimensionIndex],
        }),
        display: "bar",
        visualization_settings: {
          "graph.tooltip_type": "default",
          "stackable.stack_type": "stacked",
          "graph.dimensions": [settings["funnel.dimension"]],
          "graph.metrics": [settings["funnel.metric"]],
        },
      },
      data: {
        rows: [[row[dimensionIndex], row[metricIndex]]],
        cols: [cols[dimensionIndex], cols[metricIndex]],
      },
    };
  }) as unknown as RawSeries;
};

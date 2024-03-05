import type { TransformSeries } from "metabase/visualizations/components/TransformedVisualization";

export const funnelToBarTransform: TransformSeries = (
  rawSeries,
  settings,
  renderingContext,
) => {
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
        name: renderingContext.formatValue(row[dimensionIndex], {
          column: cols[dimensionIndex],
        }),
        display: "bar",
        visualization_settings: {
          "graph.tooltip_type": "default",
          "stackable.stack_type": "stacked" as const,
          "graph.dimensions": [settings["funnel.dimension"]],
          "graph.metrics": [settings["funnel.metric"]],
          "graph.y_axis.auto_split": false,
        },
      },
      data: {
        rows: [[row[dimensionIndex], row[metricIndex]]],
        cols: [cols[dimensionIndex], cols[metricIndex]],
        rows_truncated: 0,
        results_metadata: { columns: [] },
      },
    };
  });
};

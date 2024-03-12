import type { Dataset, VisualizationSettings } from "metabase-types/api";

export function syncColumnSettings(
  settings: VisualizationSettings,
  queryResults?: Dataset,
  prevQueryResults?: Dataset,
): VisualizationSettings {
  let newSettings = settings;

  if (queryResults && !queryResults.error) {
    if (prevQueryResults && !prevQueryResults.error) {
      newSettings = syncGraphMetricSettings(
        newSettings,
        queryResults,
        prevQueryResults,
      );
    }
  }

  return newSettings;
}

function syncGraphMetricSettings(
  settings: VisualizationSettings,
  { data: { cols } }: Dataset,
  { data: { cols: prevCols } }: Dataset,
): VisualizationSettings {
  const graphMetrics = settings["graph.metrics"];
  if (!graphMetrics) {
    return settings;
  }

  const hasNativeColumns =
    cols.some(column => column.source === "native") ||
    prevCols.some(column => column.source === "native");
  if (hasNativeColumns) {
    return settings;
  }

  const metricColumnNames = new Set(
    cols
      .filter(column => column.source === "aggregation")
      .map(column => column.name),
  );
  const prevMetricColumnNames = new Set(
    prevCols
      .filter(column => column.source === "aggregation")
      .map(column => column.name),
  );
  const addedMetricColumnNames = new Set(
    [...metricColumnNames].filter(name => !prevMetricColumnNames.has(name)),
  );
  const removedMetricColumnNames = new Set(
    [...prevMetricColumnNames].filter(name => !metricColumnNames.has(name)),
  );
  if (
    addedMetricColumnNames.size === 0 &&
    removedMetricColumnNames.size === 0
  ) {
    return settings;
  }

  return {
    ...settings,
    "graph.metrics": [
      ...graphMetrics.filter(name => !removedMetricColumnNames.has(name)),
      ...addedMetricColumnNames,
    ],
  };
}

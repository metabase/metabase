import { isCartesianChart } from "metabase/visualizations";
import type {
  DatasetColumn,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import type { VisualizerColumnValueSource } from "metabase-types/store/visualizer";

export function updateSettingsForDisplay(
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>,
  columns: DatasetColumn[],
  settings: VisualizationSettings,
  sourceDisplay: VisualizationDisplay | null,
  targetDisplay: VisualizationDisplay | null,
): {
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>;
  columns: DatasetColumn[];
  settings: VisualizationSettings;
} {
  if (!sourceDisplay || !targetDisplay) {
    return {
      columnValuesMapping,
      columns,
      settings,
    };
  }

  const sourceIsCartesian = isCartesianChart(sourceDisplay);
  const targetIsCartesian = isCartesianChart(targetDisplay);

  if (sourceIsCartesian) {
    // cartesian -> cartesian
    if (targetIsCartesian) {
      return {
        columnValuesMapping,
        columns,
        settings,
      };
    }

    // cartesian -> pie
    if (targetDisplay === "pie") {
      const {
        "graph.metrics": metrics,
        "graph.dimensions": dimensions,
        ...otherSettings
      } = settings;

      return {
        columnValuesMapping,
        columns,
        settings: {
          ...otherSettings,
          "pie.metric": metrics?.[0] ?? "",
          "pie.dimension": dimensions?.[0] ?? "",
        },
      };
    }
  }

  if (sourceDisplay === "pie") {
    // pie -> cartesian
    if (targetIsCartesian) {
      const {
        "pie.metric": metric,
        "pie.dimension": dimensions,
        ...otherSettings
      } = settings;

      return {
        columnValuesMapping,
        columns,
        settings: {
          ...otherSettings,
          "graph.metrics": [metric].filter(Boolean) as string[],
          "graph.dimensions": [dimensions].filter(Boolean) as string[],
        },
      };
    } else {
      // pie -> pie
      return {
        columnValuesMapping,
        columns,
        settings,
      };
    }
  }

  return {
    columnValuesMapping,
    columns,
    settings,
  };
}

import { isCartesianChart } from "metabase/visualizations";
import type {
  DatasetColumn,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import type { VisualizerColumnValueSource } from "metabase-types/store/visualizer";

type ColumnValuesMapping = Record<string, VisualizerColumnValueSource[]>;

export function getUpdatedSettingsForDisplay(
  columnValuesMapping: ColumnValuesMapping,
  columns: DatasetColumn[],
  settings: VisualizationSettings,
  sourceDisplay: VisualizationDisplay | null,
  targetDisplay: VisualizationDisplay | null,
):
  | {
      columnValuesMapping: ColumnValuesMapping;
      columns: DatasetColumn[];
      settings: VisualizationSettings;
    }
  | undefined {
  if (!sourceDisplay || !targetDisplay) {
    return undefined;
  }

  const sourceIsCartesian = isCartesianChart(sourceDisplay);
  const targetIsCartesian = isCartesianChart(targetDisplay);

  if (sourceIsCartesian) {
    // cartesian -> pie
    if (targetDisplay === "pie") {
      const {
        "graph.metrics": metrics = [],
        "graph.dimensions": dimensions = [],
        ...otherSettings
      } = settings;

      const metric = metrics[0];
      const newColumns = columns.filter(
        column => column.name === metric || dimensions.includes(column.name),
      );

      const newColumnValuesMapping: ColumnValuesMapping = {};
      if (metric) {
        newColumnValuesMapping[metric] = columnValuesMapping[metric];
      }

      dimensions.forEach(dimension => {
        newColumnValuesMapping[dimension] = columnValuesMapping[dimension];
      });

      return {
        columnValuesMapping: newColumnValuesMapping,
        columns: newColumns,
        settings: {
          ...otherSettings,
          "pie.metric": metric,
          "pie.dimension": dimensions.length === 1 ? dimensions[0] : dimensions,
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
    }
  }
}

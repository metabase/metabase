import _ from "underscore";

import { isNotNull } from "metabase/lib/types";
import {
  getMaxDimensionsSupported,
  getMaxMetricsSupported,
  isCartesianChart,
} from "metabase/visualizations";
import type {
  DatasetColumn,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import type { VisualizerColumnValueSource } from "metabase-types/store/visualizer";

import { isScalarFunnel } from "../visualizations/funnel";

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
    if (targetIsCartesian) {
      return cartesianToCartesian(
        columnValuesMapping,
        columns,
        settings,
        targetDisplay,
      );
    }
    if (targetDisplay === "pie") {
      return cartesianToPie(columnValuesMapping, columns, settings);
    }
  }

  if (sourceDisplay === "pie") {
    if (targetIsCartesian) {
      return pieToCartesian(
        columnValuesMapping,
        columns,
        settings,
        targetDisplay,
      );
    }
  }

  if (sourceDisplay === "funnel") {
    if (isScalarFunnel({ display: "funnel", settings })) {
      return {
        settings: _.pick(settings, "card.title"),
        columns: [],
        columnValuesMapping: {},
      };
    }
    if (targetIsCartesian) {
      return funnelToCartesian(columnValuesMapping, columns, settings);
    }
    if (targetDisplay === "pie") {
      return funnelToPie(columnValuesMapping, columns, settings);
    }
  }

  return {
    columns,
    columnValuesMapping,
    settings: _.pick(settings, "card.title"),
  };
}

const cartesianToCartesian = (
  columnValuesMapping: ColumnValuesMapping,
  columns: DatasetColumn[],
  settings: VisualizationSettings,
  targetDisplay: VisualizationDisplay,
) => {
  const maxMetrics = getMaxMetricsSupported(targetDisplay);
  const maxDimensions = getMaxDimensionsSupported(targetDisplay);

  const {
    "graph.metrics": metrics = [],
    "graph.dimensions": dimensions = [],
    ...otherSettings
  } = settings;

  const nextMetrics = metrics.slice(0, maxMetrics);
  const removedMetrics = metrics.slice(maxMetrics);

  const nextDimensions = dimensions.slice(0, maxDimensions);
  const removedDimensions = dimensions.slice(maxDimensions);

  const removedColumns = [...removedMetrics, ...removedDimensions];

  return {
    columns: columns.filter(column => !removedColumns.includes(column.name)),
    columnValuesMapping: _.omit(columnValuesMapping, removedColumns),
    settings: {
      ...otherSettings,
      "graph.metrics": nextMetrics,
      "graph.dimensions": nextDimensions,
    },
  };
};

const cartesianToPie = (
  columnValuesMapping: ColumnValuesMapping,
  columns: DatasetColumn[],
  settings: VisualizationSettings,
) => {
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
};

const pieToCartesian = (
  columnValuesMapping: ColumnValuesMapping,
  columns: DatasetColumn[],
  settings: VisualizationSettings,
  targetDisplay: VisualizationDisplay,
) => {
  const maxDimensions = getMaxDimensionsSupported(targetDisplay);

  const {
    "pie.metric": metric,
    "pie.dimension": dimensions,
    ...otherSettings
  } = settings;

  let nextDimensions = Array.isArray(dimensions)
    ? dimensions.filter(isNotNull)
    : [dimensions].filter(isNotNull);

  if (nextDimensions.length > maxDimensions) {
    nextDimensions = nextDimensions.slice(0, maxDimensions);
  }

  return {
    columns,
    columnValuesMapping,
    settings: {
      ...otherSettings,
      "graph.metrics": [metric].filter(isNotNull),
      "graph.dimensions": nextDimensions,
    },
  };
};

const funnelToCartesian = (
  columnValuesMapping: ColumnValuesMapping,
  columns: DatasetColumn[],
  settings: VisualizationSettings,
) => {
  const {
    "funnel.metric": metric,
    "funnel.dimension": dimension,
    ...otherSettings
  } = settings;

  return {
    columns,
    columnValuesMapping,
    settings: {
      ...otherSettings,
      "graph.metrics": [metric].filter(isNotNull),
      "graph.dimensions": [dimension].filter(isNotNull),
    },
  };
};

const funnelToPie = (
  columnValuesMapping: ColumnValuesMapping,
  columns: DatasetColumn[],
  settings: VisualizationSettings,
) => {
  const {
    "funnel.metric": metric,
    "funnel.dimension": dimension,
    ...otherSettings
  } = settings;

  return {
    columns,
    columnValuesMapping,
    settings: {
      ...otherSettings,
      "pie.metric": metric,
      "pie.dimensions": dimension,
    },
  };
};

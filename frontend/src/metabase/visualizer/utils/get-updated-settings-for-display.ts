import _ from "underscore";

import { isNotNull } from "metabase/lib/types";
import {
  getMaxDimensionsSupported,
  isCartesianChart,
} from "metabase/visualizations";
import type {
  DatasetColumn,
  VisualizationDisplay,
  VisualizationSettings,
  VisualizerColumnValueSource,
} from "metabase-types/api";

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
  if (!sourceDisplay || !targetDisplay || sourceDisplay === targetDisplay) {
    return undefined;
  }

  const sourceIsCartesian = isCartesianChart(sourceDisplay);
  const targetIsCartesian = isCartesianChart(targetDisplay);

  if (sourceIsCartesian) {
    if (targetIsCartesian) {
      return;
    }

    if (targetDisplay === "pie") {
      return cartesianToPie(columnValuesMapping, columns, settings);
    }

    if (targetDisplay === "funnel") {
      return cartesianToFunnel(columnValuesMapping, columns, settings);
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

    if (targetDisplay === "funnel") {
      return pieToFunnel(columnValuesMapping, columns, settings);
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

const cartesianToFunnel = (
  columnValuesMapping: ColumnValuesMapping,
  columns: DatasetColumn[],
  settings: VisualizationSettings,
) => {
  const {
    "graph.metrics": metrics = [],
    "graph.dimensions": dimensions = [],
    "card.title": cardTitle,
    ...otherSettings
  } = settings;

  return {
    settings: {
      ...otherSettings,
      "card.title": cardTitle,
      "funnel.metric": metrics[0],
      "funnel.dimension": dimensions[0],
      "graph.metrics": metrics,
      "graph.dimensions": dimensions,
    },
    columns,
    columnValuesMapping,
  };
};

const pieToFunnel = (
  columnValuesMapping: ColumnValuesMapping,
  columns: DatasetColumn[],
  settings: VisualizationSettings,
) => {
  const {
    "pie.metric": metric,
    "pie.dimension": pieDimension,
    "card.title": cardTitle,
    ...otherSettings
  } = settings;

  const dimension = Array.isArray(pieDimension)
    ? pieDimension[0]
    : pieDimension;

  return {
    columns,
    columnValuesMapping,
    settings: {
      ...otherSettings,
      "funnel.metric": metric,
      "funnel.dimension": dimension,
      "graph.metrics": [metric].filter(isNotNull) as string[],
      "graph.dimensions": [dimension].filter(isNotNull) as string[],
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
    (column) => column.name === metric || dimensions.includes(column.name),
  );

  const newColumnValuesMapping: ColumnValuesMapping = {};
  if (metric) {
    newColumnValuesMapping[metric] = columnValuesMapping[metric];
  }

  dimensions.forEach((dimension) => {
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
    "graph.dimensions": preservedDimensions = [],
    "graph.metrics": preservedMetrics = [],
    ...otherSettings
  } = settings;

  const metrics = [metric].filter(isNotNull);
  const dimensions = [dimension].filter(isNotNull);

  const isInRefs = (ref: string) =>
    columnValuesMapping[ref] && columnValuesMapping[ref].length > 0;

  return {
    columns,
    columnValuesMapping,
    settings: {
      ...otherSettings,
      "graph.metrics":
        metrics.length > 0 ? metrics : preservedMetrics.filter(isInRefs),
      "graph.dimensions":
        dimensions.length > 0
          ? dimensions
          : preservedDimensions.filter(isInRefs),
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
      "pie.dimension": dimension,
    },
  };
};

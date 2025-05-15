import _ from "underscore";

import { isPivotGroupColumn } from "metabase/lib/data_grid";
import { groupColumnsBySuitableVizSettings } from "metabase/visualizer/visualizations/compat";
import { isDate, isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type {
  Dataset,
  DatasetColumn,
  Field,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

interface CompatibilityParameters {
  currentDataset: {
    display: VisualizationDisplay | null;
    columns: DatasetColumn[];
    settings: VisualizationSettings;
  };
  targetDataset?: {
    display?: VisualizationDisplay;
    fields?: Field[];
  };
  datasets: Record<string, Dataset>;
}

export function getIsCompatible(parameters: CompatibilityParameters) {
  const { currentDataset, targetDataset, datasets } = parameters;

  const { display: currentDisplay, columns } = currentDataset;
  const ownDimensions = columns.filter(
    (col) => isDimension(col) && !isMetric(col) && !isPivotGroupColumn(col),
  );

  const fields = targetDataset?.fields ?? [];

  if (fields.length === 0) {
    return false;
  }

  if (fields.length === 1 && currentDisplay === "funnel") {
    return true; // ?
  }

  if (currentDisplay === "pie") {
    return false;
  }

  if (currentDisplay === "scalar") {
    return (
      targetDataset?.display === "scalar" &&
      fields?.some((field) => compareIdAndName(ownDimensions, field))
    );
  }

  if (!targetDataset || ownDimensions.length === 0) {
    return false;
  }

  const [timeDimensions, otherDimensions] = _.partition(ownDimensions, (col) =>
    isDate(col),
  );

  if (timeDimensions.length > 0) {
    const isCompatible = fields.some((field) => isDate(field));
    if (!isCompatible) {
      return false;
    }
  }
  if (otherDimensions.length > 0) {
    const isCompatible = otherDimensions.every((dimension) =>
      fields.some((field) => field.id === dimension.id),
    );
    if (!isCompatible) {
      return false;
    }
  }

  const columnSettingMapping = groupColumnsBySuitableVizSettings(
    currentDataset,
    datasets,
    fields,
  );
  return Object.keys(columnSettingMapping).length > 0;
}

function compareIdAndName(dimensions: DatasetColumn[], field: Field): boolean {
  return dimensions.some(
    (column) => column.id === field.id && column.name === field.name,
  );
}

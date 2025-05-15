import _ from "underscore";

import { isPivotGroupColumn } from "metabase/lib/data_grid";
import { groupColumnsBySuitableVizSettings } from "metabase/visualizer/visualizations/compat";
import {
  isDate,
  isDimension,
  isMetric,
  isNumeric,
} from "metabase-lib/v1/types/utils/isa";
import type {
  Dataset,
  DatasetColumn,
  Field,
  VisualizationDisplay,
  VisualizationSettings,
  VisualizerDataSource,
} from "metabase-types/api";

interface CompatibilityParameters {
  currentDataset: {
    display: VisualizationDisplay | null;
    columns: DatasetColumn[];
    settings: VisualizationSettings;
  };
  targetDataset: {
    fields: Field[];
    dataSource: VisualizerDataSource;
  };
  datasets: Record<string, Dataset>;
}

export function getIsCompatible(parameters: CompatibilityParameters) {
  const { currentDataset, targetDataset, datasets } = parameters;

  const { display: currentDisplay, columns } = currentDataset;
  const { fields, dataSource } = targetDataset;

  const ownDimensions = columns.filter(
    (col) => isDimension(col) && !isMetric(col) && !isPivotGroupColumn(col),
  );

  if (fields.length === 0) {
    return false;
  }

  // TODO Move to funnel compat check
  if (
    currentDisplay === "funnel" &&
    fields.length === 1 &&
    isNumeric(fields[0])
  ) {
    return true;
  }

  if (currentDisplay === "pie") {
    return false;
  }

  if (ownDimensions.length === 0) {
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
    dataSource,
  );
  return Object.keys(columnSettingMapping).length > 0;
}

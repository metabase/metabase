import _ from "underscore";

import { isDate } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  Field,
  VisualizationDisplay,
} from "metabase-types/api";

interface CompatibilityParameters {
  currentDataset: {
    display?: VisualizationDisplay;
    dimensions?: DatasetColumn[];
  };
  targetDataset?: {
    display?: VisualizationDisplay;
    fields?: Field[];
  };
}

export function getIsCompatible(parameters: CompatibilityParameters) {
  const { currentDataset, targetDataset } = parameters;

  const { display: currentDisplay, dimensions = [] } = currentDataset;
  const fields = targetDataset?.fields;

  if (!fields) {
    return false;
  }

  if (fields.length === 1) {
    return currentDisplay === "funnel";
  }

  if (currentDisplay === "pie") {
    return false;
  }

  if (currentDisplay === "scalar") {
    return (
      targetDataset?.display === "scalar" &&
      fields?.some((field) => compareIdAndName(dimensions, field))
    );
  }

  if (!targetDataset || dimensions.length === 0) {
    return false;
  }

  const [timeDimensions, otherDimensions] = _.partition(dimensions, (col) =>
    isDate(col),
  );

  let isCompatible = false;
  if (timeDimensions.length > 0) {
    isCompatible = timeDimensions.some((dimension) => isDate(dimension));
  }
  if (otherDimensions.length > 0) {
    isCompatible = otherDimensions.every((dimension) =>
      fields.some((field) => field.id === dimension.id),
    );
  }

  return isCompatible;
}

function compareIdAndName(dimensions: DatasetColumn[], field: Field): boolean {
  return dimensions.some(
    (column) => column.id === field.id && column.name === field.name,
  );
}

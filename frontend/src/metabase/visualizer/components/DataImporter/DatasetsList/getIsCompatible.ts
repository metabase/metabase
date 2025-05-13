import * as Lib from "metabase-lib";
import { isDate, isNumber, isString } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  Field,
  VisualizationDisplay,
} from "metabase-types/api";

function compareIdAndName(dimensions: DatasetColumn[], field: Field): boolean {
  return dimensions.some(
    (column) => column.id === field.id && column.name === field.name,
  );
}

function compareType(dimensions: DatasetColumn[], field: Field): boolean {
  const fieldType = Lib.legacyColumnTypeInfo(field as any); // TODO: Fix this type
  return dimensions
    .map((column) => Lib.legacyColumnTypeInfo(column))
    .some((dimensionType) => Lib.isAssignableType(dimensionType, fieldType));
}

function comparedId(dimensions: DatasetColumn[], field: Field): boolean {
  return dimensions.some((column) => column.id === field.id);
}

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

  const idAndNameMatcher = (f: Field) => compareIdAndName(dimensions, f);
  const idMatcher = (f: Field) => comparedId(dimensions, f);
  const typeMatcher = (f: Field) => compareType(dimensions, f);

  if (currentDisplay === "scalar") {
    return (
      targetDataset?.display === "scalar" && !!fields?.find(idAndNameMatcher)
    );
  }

  if (!targetDataset || dimensions.length === 0) {
    return false;
  }

  const [primaryColumn] = dimensions;

  if (isNumber(primaryColumn) || isString(primaryColumn)) {
    return fields.some(idMatcher) || fields.some(typeMatcher);
  }

  if (isDate(primaryColumn)) {
    return fields.some(typeMatcher);
  }

  return false;
}

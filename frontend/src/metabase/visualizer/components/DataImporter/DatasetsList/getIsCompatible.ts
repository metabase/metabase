import { isDate, isNumber, isString } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  Field,
  VisualizationDisplay,
} from "metabase-types/api";

function compareIdAndName(
  column: DatasetColumn | undefined,
  field: Field,
): boolean {
  if (!column) {
    return false;
  }

  return column.name === field.name && column.id === field.id;
}

function compareTypeAndName(
  column: DatasetColumn | undefined,
  field: Field,
): boolean {
  if (!column) {
    return false;
  }

  return column.semantic_type === field.semantic_type;
}

interface CompatibilityParameters {
  currentDataset: {
    display?: VisualizationDisplay;
    primaryColumn?: DatasetColumn;
  };
  targetDataset?: {
    display?: VisualizationDisplay;
    fields?: Field[];
  };
}

export function getIsCompatible(parameters: CompatibilityParameters) {
  const { currentDataset, targetDataset } = parameters;

  const { display: currentDisplay, primaryColumn } = currentDataset;
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

  const idAndNameMatcher = (field: Field) =>
    compareIdAndName(primaryColumn, field);

  const typeMatcher = (field: Field) =>
    compareTypeAndName(primaryColumn, field);

  if (currentDisplay === "scalar") {
    return (
      targetDataset?.display === "scalar" && !!fields?.find(idAndNameMatcher)
    );
  }

  if (!primaryColumn || !targetDataset) {
    return false;
  }

  if (isNumber(primaryColumn) || isString(primaryColumn)) {
    return fields.some(idAndNameMatcher) || fields.some(typeMatcher);
  }

  if (isDate(primaryColumn)) {
    return fields.some(typeMatcher);
  }

  return false;
}

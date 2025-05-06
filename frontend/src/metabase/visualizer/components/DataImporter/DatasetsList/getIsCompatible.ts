import * as Lib from "metabase-lib";
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

function compareType(column: DatasetColumn | undefined, field: Field): boolean {
  if (!column) {
    return false;
  }

  return Lib.isAssignableType(
    Lib.legacyColumnTypeInfo(column),
    Lib.legacyColumnTypeInfo(field as any), // TODO: Fix this type
  );
}

function comparedId(column: DatasetColumn | undefined, field: Field): boolean {
  if (!column) {
    return false;
  }

  return column.id === field.id;
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

  const idAndNameMatcher = (f: Field) => compareIdAndName(primaryColumn, f);
  const idMatcher = (f: Field) => comparedId(primaryColumn, f);
  const typeMatcher = (f: Field) => compareType(primaryColumn, f);

  if (currentDisplay === "scalar") {
    return (
      targetDataset?.display === "scalar" && !!fields?.find(idAndNameMatcher)
    );
  }

  if (!primaryColumn || !targetDataset) {
    return false;
  }

  if (isNumber(primaryColumn) || isString(primaryColumn)) {
    return fields.some(idMatcher) || fields.some(typeMatcher);
  }

  if (isDate(primaryColumn)) {
    return fields.some(typeMatcher);
  }

  return false;
}

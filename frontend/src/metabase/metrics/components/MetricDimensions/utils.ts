import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";
import { COORDINATE, LOCATION } from "metabase-lib/v1/types/constants";
import {
  isBoolean,
  isCategory,
  isDate,
  isFieldType,
  isNumeric,
  isString,
  isStringLike,
} from "metabase-lib/v1/types/utils/isa";
import type {
  CardQueryMetadata,
  IconName,
  MetricDimension,
  MetricDimensionGroup,
} from "metabase-types/api";

export function getDimensionIcon(dimension: MetricDimension): IconName {
  return getColumnIcon(
    Lib.legacyColumnTypeInfo({
      effective_type: dimension.effective_type,
      semantic_type: dimension.semantic_type,
    }),
  );
}

export type DimensionTypeKey =
  | "date"
  | "geolocation"
  | "category"
  | "number"
  | "other";

export function getDimensionTypeKey(
  dimension: MetricDimension,
): DimensionTypeKey {
  if (isDate(dimension)) {
    return "date";
  }
  if (isFieldType(LOCATION, dimension) || isFieldType(COORDINATE, dimension)) {
    return "geolocation";
  }
  if (
    isCategory(dimension) ||
    isString(dimension) ||
    isStringLike(dimension) ||
    isBoolean(dimension)
  ) {
    return "category";
  }
  if (isNumeric(dimension)) {
    return "number";
  }
  return "other";
}

export function getDimensionTypeLabel(dimension: MetricDimension): string {
  switch (getDimensionTypeKey(dimension)) {
    case "date":
      return t`Date`;
    case "geolocation":
      return t`Location`;
    case "category":
      return t`Category`;
    case "number":
      return t`Number`;
    case "other":
      return t`Other`;
  }
}

export function isOrphaned(dimension: MetricDimension): boolean {
  return dimension.status === "status/orphaned";
}

export function getNewDimensionTitle(
  group: MetricDimensionGroup,
  dimension: MetricDimension,
): string {
  return group.type === "connection"
    ? `${group.display_name} - ${dimension.display_name}`
    : dimension.display_name;
}

export function getSourceColumnLabel(
  dimension: MetricDimension,
  queryMetadata: CardQueryMetadata,
): string | null {
  const sourceFieldId = dimension.sources?.[0]?.["field-id"];
  const sourceField =
    queryMetadata.fields.find((field) => field.id === sourceFieldId) ??
    queryMetadata.tables
      .flatMap((table) => table.fields ?? [])
      .find((field) => field.id === sourceFieldId);
  const sourceColumn = sourceField?.display_name;
  if (!sourceColumn) {
    return null;
  }
  const table = dimension.group?.display_name;
  return table ? `${table}.${sourceColumn}` : sourceColumn;
}

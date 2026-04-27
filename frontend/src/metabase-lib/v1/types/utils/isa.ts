import { isa as cljs_isa } from "cljs/metabase.types.core";
import { isVirtualCardId } from "metabase-lib/v1/metadata/utils/saved-questions";
import {
  BOOLEAN,
  COORDINATE,
  FOREIGN_KEY,
  type FieldTypeKey,
  type Hierarchy,
  INTEGER,
  LOCATION,
  NUMBER,
  PRIMARY_KEY,
  STRING,
  STRING_LIKE,
  SUMMABLE,
  TEMPORAL,
  TYPE,
  TYPE_HIERARCHIES,
} from "metabase-lib/v1/types/constants";
import type { DatasetColumn, TableId } from "metabase-types/api";

/**
 * A minimal field-like shape shared by both Field and DatasetColumn,
 * used by functions that only need type-checking properties.
 */
export interface FieldTypeInfo {
  base_type?: string;
  effective_type?: string | null;
  semantic_type?: string | null;
}

/**
 * Is x the same as, or a descendant type of, y?
 *
 * @example
 * isa(field.semantic_type, TYPE.Currency);
 */
export const isa = (x: string | null | undefined, y: string): boolean =>
  cljs_isa(x, y);

// convenience functions since these operations are super-common
// this will also make it easier to tweak how these checks work in the future,
// e.g. when we add an `is_pk` column and eliminate the PK semantic type we can just look for places that use isPK

export function isTypePK(type: string | null | undefined): boolean {
  return isa(type, TYPE.PK);
}

export function isTypeFK(type: string | null | undefined): boolean {
  return isa(type, TYPE.FK);
}

export function isTypeCurrency(type: string | null | undefined): boolean {
  return isa(type, TYPE.Currency);
}

export function isFieldType(
  type: FieldTypeKey,
  field: FieldTypeInfo | null | undefined,
): boolean {
  if (!field) {
    return false;
  }

  const typeDefinition = TYPE_HIERARCHIES[type];
  // check to see if it belongs to any of the field types:
  const props: (keyof Hierarchy & keyof FieldTypeInfo)[] = field.effective_type
    ? ["effective_type", "semantic_type"]
    : ["base_type", "semantic_type"];
  for (const prop of props) {
    const allowedTypes = typeDefinition[prop];
    if (!allowedTypes) {
      continue;
    }

    const fieldType = field[prop];
    for (const allowedType of allowedTypes) {
      if (isa(fieldType, allowedType)) {
        return true;
      }
    }
  }

  // recursively check to see if it's NOT another field type:
  for (const excludedType of typeDefinition.exclude || []) {
    if (isFieldType(excludedType, field)) {
      return false;
    }
  }

  // recursively check to see if it's another field type:
  for (const includedType of typeDefinition.include || []) {
    if (isFieldType(includedType, field)) {
      return true;
    }
  }
  return false;
}

export function getFieldType(field: FieldTypeInfo) {
  // try more specific types first, then more generic types
  const types: FieldTypeKey[] = [
    TEMPORAL,
    LOCATION,
    COORDINATE,
    FOREIGN_KEY,
    PRIMARY_KEY,
    BOOLEAN,
    STRING,
    STRING_LIKE,
    NUMBER,
  ];
  for (const type of types) {
    if (isFieldType(type, field)) {
      return type;
    }
  }
}

export const isDate = (field: FieldTypeInfo | null | undefined) =>
  isFieldType(TEMPORAL, field);
export const isNumeric = (field: FieldTypeInfo | null | undefined) =>
  isFieldType(NUMBER, field);
export const isInteger = (field: FieldTypeInfo | null | undefined) =>
  isFieldType(INTEGER, field);
export const isBoolean = (field: FieldTypeInfo | null | undefined) =>
  isFieldType(BOOLEAN, field);
export const isString = (field: FieldTypeInfo | null | undefined) =>
  isFieldType(STRING, field);
export const isStringLike = (field: FieldTypeInfo | null | undefined) =>
  isFieldType(STRING_LIKE, field);
export const isSummable = (field: FieldTypeInfo | null | undefined) =>
  isFieldType(SUMMABLE, field);

const hasNonMetricName = (col: DatasetColumn) => {
  const name = col.name.toLowerCase();
  return name === "id" || name.endsWith("_id") || name.endsWith("-id");
};

export const isDimension = (col: DatasetColumn) =>
  col.source !== "aggregation" || !!col.binning_info; // columns with binning_info are always dimensions (they represent categorical buckets)
export const isMetric = (col: DatasetColumn) =>
  col.source !== "breakout" &&
  isSummable(col) &&
  !hasNonMetricName(col) &&
  !col.binning_info; // do not treat column with binning_info as metric by default (metabase#10493)

export const isFK = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isTypeFK(field.semantic_type);
export const isPK = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isTypePK(field.semantic_type);
export const isEntityName = (
  field: FieldTypeInfo | null | undefined,
): boolean => !!field && isa(field.semantic_type, TYPE.Name);
export const isTitle = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isa(field.semantic_type, TYPE.Title);
export const isProduct = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isa(field.semantic_type, TYPE.Product);
export const isSource = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isa(field.semantic_type, TYPE.Source);
export const isAddress = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isa(field.semantic_type, TYPE.Address);
export const isScore = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isa(field.semantic_type, TYPE.Score);
export const isQuantity = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isa(field.semantic_type, TYPE.Quantity);
export const isCategory = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isa(field.semantic_type, TYPE.Category);

export const isAny = (_col: FieldTypeInfo | null | undefined) => true;

export const isNumericBaseType = (
  field: FieldTypeInfo | null | undefined,
): boolean => {
  if (!field) {
    return false;
  }
  if (field.effective_type) {
    return isa(field.effective_type, TYPE.Number);
  } else {
    return isa(field.base_type, TYPE.Number);
  }
};

export const isDateWithoutTime = (
  field: FieldTypeInfo | null | undefined,
): boolean => {
  if (!field) {
    return false;
  }
  if (field.effective_type) {
    return isa(field.effective_type, TYPE.Date);
  } else {
    return isa(field.base_type, TYPE.Date);
  }
};

// ZipCode, ID, etc derive from Number but should not be formatted as numbers
export const isNumber = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field &&
  isNumericBaseType(field) &&
  (field.semantic_type == null ||
    isa(field.semantic_type, TYPE.Number) ||
    isa(field.semantic_type, TYPE.Category));
export const isFloat = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isa(field.semantic_type, TYPE.Float);

export const isTime = (field: FieldTypeInfo | null | undefined): boolean => {
  if (!field) {
    return false;
  }
  if (field.effective_type) {
    return isa(field.effective_type, TYPE.Time);
  } else {
    return isa(field.base_type, TYPE.Time);
  }
};

export const isState = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isa(field.semantic_type, TYPE.State);
export const isCountry = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isa(field.semantic_type, TYPE.Country);
export const isCoordinate = (
  field: FieldTypeInfo | null | undefined,
): boolean => !!field && isa(field.semantic_type, TYPE.Coordinate);
export const isLatitude = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isa(field.semantic_type, TYPE.Latitude);
export const isLongitude = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isa(field.semantic_type, TYPE.Longitude);

export const isCurrency = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isa(field.semantic_type, TYPE.Currency);

export const isPercentage = (
  field: FieldTypeInfo | null | undefined,
): boolean => !!field && isa(field.semantic_type, TYPE.Percentage);

export const isID = (field: FieldTypeInfo | null | undefined): boolean =>
  isFK(field) || isPK(field);

export const isURL = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isa(field.semantic_type, TYPE.URL);
export const isEmail = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isa(field.semantic_type, TYPE.Email);
export const isAvatarURL = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isa(field.semantic_type, TYPE.AvatarURL);
export const isImageURL = (field: FieldTypeInfo | null | undefined): boolean =>
  !!field && isa(field.semantic_type, TYPE.ImageURL);

export function hasLatitudeAndLongitudeColumns(cols: FieldTypeInfo[]) {
  let hasLatitude = false;
  let hasLongitude = false;
  for (const col of cols) {
    if (isLatitude(col)) {
      hasLatitude = true;
    }
    if (isLongitude(col)) {
      hasLongitude = true;
    }
  }
  return hasLatitude && hasLongitude;
}

export const getIsPKFromTablePredicate =
  (tableId: TableId | null | undefined) =>
  (column: FieldTypeInfo & { table_id?: TableId }): boolean => {
    const isPrimaryKey = isPK(column);

    // FIXME: columns of nested questions at this moment miss table_id value
    // which makes it impossible to match them with their tables that are nested cards
    return isVirtualCardId(tableId)
      ? isPrimaryKey
      : isPrimaryKey && column.table_id === tableId;
  };

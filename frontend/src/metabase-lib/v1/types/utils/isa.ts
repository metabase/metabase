import { isa as cljs_isa } from "cljs/metabase.types.core";
import { isVirtualCardId } from "metabase-lib/v1/metadata/utils/saved-questions";
import {
  BOOLEAN,
  COORDINATE,
  FOREIGN_KEY,
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
import type { TableId } from "metabase-types/api";

/**
 * A loose interface for field-like objects. Many callers pass partial objects
 * with just the type properties they need (e.g., `{ base_type: "type/Integer" }`).
 *
 * All properties are optional because:
 * 1. Different functions check different properties
 * 2. Callers often pass minimal objects with just the fields they need
 * 3. Functions handle missing properties gracefully (return false)
 *
 * In order to be able to narrow this type, we'll have to fix all its usage first.
 */
export interface FieldLike {
  base_type?: string | null;
  effective_type?: string | null;
  semantic_type?: string | null;
  source?: string | null;
  binning_info?: unknown;
  name?: string;
  table_id?: TableId | null;
}

type FieldTypeCategory = keyof typeof TYPE_HIERARCHIES;

/**
 * Is x the same as, or a descendant type of, y?
 *
 * @example
 * isa(field.semantic_type, TYPE.Currency);
 */
export function isa<Y extends string>(
  x: string | null | undefined,
  y: Y,
): x is Y {
  if (x == null) {
    return false;
  }
  return cljs_isa(x, y);
}

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
  type: FieldTypeCategory,
  field: FieldLike | null | undefined,
): boolean {
  if (!field) {
    return false;
  }

  const typeDefinition = TYPE_HIERARCHIES[type];
  // check to see if it belongs to any of the field types:
  const props: Array<"effective" | "base" | "semantic"> = field.effective_type
    ? ["effective", "semantic"]
    : ["base", "semantic"];
  for (const prop of props) {
    const allowedTypes = typeDefinition[prop as keyof typeof typeDefinition] as
      | string[]
      | undefined;
    if (!allowedTypes) {
      continue;
    }

    const fieldType = field[`${prop}_type` as keyof typeof field] as
      | string
      | null
      | undefined;
    for (const allowedType of allowedTypes) {
      if (isa(fieldType, allowedType)) {
        return true;
      }
    }
  }

  // recursively check to see if it's NOT another field type:
  const excludeTypes = (typeDefinition as { exclude?: FieldTypeCategory[] })
    .exclude;
  for (const excludedType of excludeTypes || []) {
    if (isFieldType(excludedType, field)) {
      return false;
    }
  }

  // recursively check to see if it's another field type:
  const includeTypes = (typeDefinition as { include?: FieldTypeCategory[] })
    .include;
  for (const includedType of includeTypes || []) {
    if (isFieldType(includedType, field)) {
      return true;
    }
  }
  return false;
}

export function getFieldType(
  field: FieldLike | null | undefined,
): FieldTypeCategory | undefined {
  // try more specific types first, then more generic types
  const types: FieldTypeCategory[] = [
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
  return undefined;
}

export const isDate = (field: FieldLike | null | undefined): boolean =>
  isFieldType(TEMPORAL, field);
export const isNumeric = (field: FieldLike | null | undefined): boolean =>
  isFieldType(NUMBER, field);
export const isInteger = (field: FieldLike | null | undefined): boolean =>
  isFieldType(INTEGER, field);
export const isBoolean = (field: FieldLike | null | undefined): boolean =>
  isFieldType(BOOLEAN, field);
export const isString = (field: FieldLike | null | undefined): boolean =>
  isFieldType(STRING, field);
export const isStringLike = (field: FieldLike | null | undefined): boolean =>
  isFieldType(STRING_LIKE, field);
export const isSummable = (field: FieldLike | null | undefined): boolean =>
  isFieldType(SUMMABLE, field);

const hasNonMetricName = (col: FieldLike): boolean => {
  const name = col?.name?.toLowerCase();
  return (
    name === "id" ||
    name?.endsWith("_id") === true ||
    name?.endsWith("-id") === true
  );
};

// columns with binning_info are always dimensions (they represent categorical buckets)
export const isDimension = (col: FieldLike | null | undefined): boolean =>
  Boolean(col && (col.source !== "aggregation" || col.binning_info));

export const isMetric = (col: FieldLike | null | undefined): boolean =>
  Boolean(
    col &&
      col.source !== "breakout" &&
      isSummable(col) &&
      !hasNonMetricName(col),
  );

export const isFK = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isTypeFK(field.semantic_type));

export const isPK = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isTypePK(field.semantic_type));

export const isEntityName = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.Name));

export const isTitle = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.Title));

export const isProduct = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.Product));

export const isSource = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.Source));

export const isAddress = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.Address));

export const isScore = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.Score));

export const isQuantity = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.Quantity));

export const isCategory = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.Category));

export const isAny = (_col: FieldLike): boolean => true;

export const isNumericBaseType = (
  field: FieldLike | null | undefined,
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
  field: FieldLike | null | undefined,
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
export const isNumber = (field: FieldLike | null | undefined): boolean =>
  Boolean(
    field &&
      isNumericBaseType(field) &&
      (field.semantic_type == null ||
        isa(field.semantic_type, TYPE.Number) ||
        isa(field.semantic_type, TYPE.Category)),
  );

export const isFloat = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.Float));

export const isTime = (field: FieldLike | null | undefined): boolean => {
  if (!field) {
    return false;
  }
  if (field.effective_type) {
    return isa(field.effective_type, TYPE.Time);
  } else {
    return isa(field.base_type, TYPE.Time);
  }
};

export const isState = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.State));

export const isCountry = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.Country));

export const isCoordinate = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.Coordinate));

export const isLatitude = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.Latitude));

export const isLongitude = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.Longitude));

export const isCurrency = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.Currency));

export const isPercentage = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.Percentage));

export const isID = (field: FieldLike | null | undefined): boolean =>
  isFK(field) || isPK(field);

export const isURL = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.URL));

export const isEmail = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.Email));

export const isAvatarURL = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.AvatarURL));

export const isImageURL = (field: FieldLike | null | undefined): boolean =>
  Boolean(field && isa(field.semantic_type, TYPE.ImageURL));

export function hasLatitudeAndLongitudeColumns(cols: FieldLike[]): boolean {
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
  (column: FieldLike | null | undefined): boolean => {
    const isPrimaryKey = isPK(column);

    // FIXME: columns of nested questions at this moment miss table_id value
    // which makes it impossible to match them with their tables that are nested cards
    return isVirtualCardId(tableId)
      ? isPrimaryKey
      : isPrimaryKey && column?.table_id === tableId;
  };

import { isa as cljs_isa } from "cljs/metabase.types";
import { isVirtualCardId } from "metabase-lib/metadata/utils/saved-questions";

import {
  TYPE,
  TYPE_HIERARCHIES,
  TEMPORAL,
  LOCATION,
  COORDINATE,
  FOREIGN_KEY,
  PRIMARY_KEY,
  STRING,
  STRING_LIKE,
  NUMBER,
  INTEGER,
  BOOLEAN,
  SUMMABLE,
  SCOPE,
  CATEGORY,
} from "metabase-lib/types/constants";

/**
 * Is x the same as, or a descendant type of, y?
 *
 * @example
 * isa(field.semantic_type, TYPE.Currency);
 *
 * @param {string} x
 * @param {string} y
 * @return {boolean}
 */
export const isa = (x, y) => cljs_isa(x, y);

// convenience functions since these operations are super-common
// this will also make it easier to tweak how these checks work in the future,
// e.g. when we add an `is_pk` column and eliminate the PK semantic type we can just look for places that use isPK

export function isTypePK(type) {
  return isa(type, TYPE.PK);
}

export function isTypeFK(type) {
  return isa(type, TYPE.FK);
}

export function isFieldType(type, field) {
  if (!field) {
    return false;
  }

  const typeDefinition = TYPE_HIERARCHIES[type];
  // check to see if it belongs to any of the field types:
  const props = field.effective_type
    ? ["effective", "semantic"]
    : ["base", "semantic"];
  for (const prop of props) {
    const allowedTypes = typeDefinition[prop];
    if (!allowedTypes) {
      continue;
    }

    const fieldType = field[prop + "_type"];
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

export function getFieldType(field) {
  // try more specific types first, then more generic types
  for (const type of [
    TEMPORAL,
    LOCATION,
    COORDINATE,
    FOREIGN_KEY,
    PRIMARY_KEY,
    BOOLEAN,
    STRING,
    STRING_LIKE,
    NUMBER,
  ]) {
    if (isFieldType(type, field)) {
      return type;
    }
  }
}

export const isDate = isFieldType.bind(null, TEMPORAL);
export const isNumeric = isFieldType.bind(null, NUMBER);
export const isInteger = isFieldType.bind(null, INTEGER);
export const isBoolean = isFieldType.bind(null, BOOLEAN);
export const isString = isFieldType.bind(null, STRING);
export const isSummable = isFieldType.bind(null, SUMMABLE);
export const isScope = isFieldType.bind(null, SCOPE);
export const isCategory = isFieldType.bind(null, CATEGORY);
export const isLocation = isFieldType.bind(null, LOCATION);

export const isDimension = col =>
  col && col.source !== "aggregation" && !isDescription(col);
export const isMetric = col =>
  col && col.source !== "breakout" && isSummable(col);

export const isFK = field => field && isTypeFK(field.semantic_type);
export const isPK = field => field && isTypePK(field.semantic_type);
export const isEntityName = field =>
  field && isa(field.semantic_type, TYPE.Name);

export const isAny = col => true;

export const isNumericBaseType = field => {
  if (!field) {
    return false;
  }
  if (field.effective_type) {
    return isa(field.effective_type, TYPE.Number);
  } else {
    return isa(field.base_type, TYPE.Number);
  }
};

export const isDateWithoutTime = field => {
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
export const isNumber = field =>
  field &&
  isNumericBaseType(field) &&
  (field.semantic_type == null || isa(field.semantic_type, TYPE.Number));

export const isTime = field => {
  if (!field) {
    return false;
  }
  if (field.effective_type) {
    return isa(field.effective_type, TYPE.Time);
  } else {
    return isa(field.base_type, TYPE.Time);
  }
};

export const isAddress = field =>
  field && isa(field.semantic_type, TYPE.Address);
export const isCity = field => field && isa(field.semantic_type, TYPE.City);
export const isState = field => field && isa(field.semantic_type, TYPE.State);
export const isZipCode = field =>
  field && isa(field.semantic_type, TYPE.ZipCode);
export const isCountry = field =>
  field && isa(field.semantic_type, TYPE.Country);
export const isCoordinate = field =>
  field && isa(field.semantic_type, TYPE.Coordinate);
export const isLatitude = field =>
  field && isa(field.semantic_type, TYPE.Latitude);
export const isLongitude = field =>
  field && isa(field.semantic_type, TYPE.Longitude);

export const isCurrency = field =>
  field && isa(field.semantic_type, TYPE.Currency);

export const isPercentage = field =>
  field && isa(field.semantic_type, TYPE.Percentage);

export const isDescription = field =>
  field && isa(field.semantic_type, TYPE.Description);

export const isComment = field =>
  field && isa(field.semantic_type, TYPE.Comment);

export const isLongText = field =>
  field && (isComment(field) || isDescription(field));

export const isID = field => isFK(field) || isPK(field);

export const isURL = field => field && isa(field.semantic_type, TYPE.URL);
export const isEmail = field => field && isa(field.semantic_type, TYPE.Email);
export const isAvatarURL = field =>
  field && isa(field.semantic_type, TYPE.AvatarURL);
export const isImageURL = field =>
  field && isa(field.semantic_type, TYPE.ImageURL);

export function hasLatitudeAndLongitudeColumns(cols) {
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

export const getIsPKFromTablePredicate = tableId => column => {
  const isPrimaryKey = isPK(column);

  // FIXME: columns of nested questions at this moment miss table_id value
  // which makes it impossible to match them with their tables that are nested cards
  return isVirtualCardId(tableId)
    ? isPrimaryKey
    : isPrimaryKey && column.table_id === tableId;
};

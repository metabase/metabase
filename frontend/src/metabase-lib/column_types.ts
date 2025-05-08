import {
  legacy_column__GT_type_info,
  valid_filter_for_QMARK_,
} from "cljs/metabase.lib.js";
import {
  URL_QMARK_,
  address_QMARK_,
  avatar_URL_QMARK_,
  boolean_QMARK_,
  category_QMARK_,
  city_QMARK_,
  comment_QMARK_,
  coordinate_QMARK_,
  country_QMARK_,
  creation_date_QMARK_,
  creation_time_QMARK_,
  creation_timestamp_QMARK_,
  currency_QMARK_,
  date_or_datetime_QMARK_,
  date_without_time_QMARK_,
  description_QMARK_,
  email_QMARK_,
  entity_name_QMARK_,
  foreign_key_QMARK_,
  id_QMARK_,
  image_URL_QMARK_,
  integer_QMARK_,
  latitude_QMARK_,
  location_QMARK_,
  longitude_QMARK_,
  numeric_QMARK_,
  primary_key_QMARK_,
  state_QMARK_,
  string_QMARK_,
  string_like_QMARK_,
  string_or_string_like_QMARK_,
  temporal_QMARK_,
  time_QMARK_,
  title_QMARK_,
  zip_code_QMARK_,
} from "cljs/metabase.lib.types.isa";
import type Field from "metabase-lib/v1/metadata/Field";
import type { DatasetColumn } from "metabase-types/api";

import type { ColumnMetadata, ColumnTypeInfo } from "./types";

type TypeFn = (column: ColumnMetadata | ColumnTypeInfo) => boolean;

// Effective type checks.
export const isBoolean: TypeFn = boolean_QMARK_;
export const isTemporal: TypeFn = temporal_QMARK_;
export const isDateOrDateTime: TypeFn = date_or_datetime_QMARK_;
export const isDateWithoutTime: TypeFn = date_without_time_QMARK_;
export const isInteger: TypeFn = integer_QMARK_;
export const isString: TypeFn = string_QMARK_;
export const isStringLike: TypeFn = string_like_QMARK_;
export const isStringOrStringLike: TypeFn = string_or_string_like_QMARK_;
export const isTime: TypeFn = time_QMARK_;

// Checks for both effective and semantic types. This hack is required to
// support numbers stored as strings in MySQL until there is a proper
// coercion strategy. `isString` and `isNumeric` would be both `true` for such
// columns; that's why `isNumeric` needs to be called first. See #44431.
export const isNumeric: TypeFn = numeric_QMARK_;

// Semantic type checks. A semantic type can be assigned to a column with an
// unrelated effective type. Do not imply any effective type when checking for a
// semantic type.
export const isAddress: TypeFn = address_QMARK_;
export const isAvatarURL: TypeFn = avatar_URL_QMARK_;
export const isCategory: TypeFn = category_QMARK_;
export const isCity: TypeFn = city_QMARK_;
export const isComment: TypeFn = comment_QMARK_;
export const isCoordinate: TypeFn = coordinate_QMARK_;
export const isCountry: TypeFn = country_QMARK_;
export const isCreationDate: TypeFn = creation_date_QMARK_;
export const isCreationTime: TypeFn = creation_time_QMARK_;
export const isCreationTimestamp: TypeFn = creation_timestamp_QMARK_;
export const isCurrency: TypeFn = currency_QMARK_;
export const isDescription: TypeFn = description_QMARK_;
export const isEmail: TypeFn = email_QMARK_;
export const isEntityName: TypeFn = entity_name_QMARK_;
export const isForeignKey: TypeFn = foreign_key_QMARK_;
export const isID: TypeFn = id_QMARK_;
export const isImageURL: TypeFn = image_URL_QMARK_;
export const isLocation: TypeFn = location_QMARK_;
export const isLatitude: TypeFn = latitude_QMARK_;
export const isLongitude: TypeFn = longitude_QMARK_;
export const isPrimaryKey: TypeFn = primary_key_QMARK_;
export const isState: TypeFn = state_QMARK_;
export const isTitle: TypeFn = title_QMARK_;
export const isURL: TypeFn = URL_QMARK_;
export const isZipCode: TypeFn = zip_code_QMARK_;

export function legacyColumnTypeInfo(
  column: DatasetColumn | Field,
): ColumnTypeInfo {
  return legacy_column__GT_type_info(column);
}

export function isAssignableType(
  column1: ColumnMetadata | ColumnTypeInfo,
  column2: ColumnMetadata | ColumnTypeInfo,
): boolean {
  return valid_filter_for_QMARK_(column1, column2);
}

import * as ML from "cljs/metabase.lib.js";
import * as TYPES from "cljs/metabase.lib.types.isa";

import type { ColumnMetadata, ColumnTypeInfo, JsColumnTypeInfo } from "./types";

type ColumnLike = ColumnMetadata | ColumnTypeInfo;

// Effective type checks.
export const isBoolean = TYPES.boolean_QMARK_;
export const isTemporal = TYPES.temporal_QMARK_;
export const isDateOrDateTime = TYPES.date_or_datetime_QMARK_;
export const isDateWithoutTime = TYPES.date_without_time_QMARK_;
export const isInteger = TYPES.integer_QMARK_;
export const isNumeric = TYPES.numeric_QMARK_;
export const isString = TYPES.string_QMARK_;
export const isStringLike = TYPES.string_like_QMARK_;
export const isStringOrStringLike = TYPES.string_or_string_like_QMARK_;
export const isTime = TYPES.time_QMARK_;

// Semantic type checks. A semantic type can be assigned to a column with an
// unrelated effective type. Do not imply any effective type when checking for a
// semantic type.
export const isAddress = TYPES.address_QMARK_;
export const isAvatarURL = TYPES.avatar_URL_QMARK_;
export const isCategory = TYPES.category_QMARK_;
export const isCity = TYPES.city_QMARK_;
export const isComment = TYPES.comment_QMARK_;
export const isCoordinate = TYPES.coordinate_QMARK_;
export const isCountry = TYPES.country_QMARK_;
export const isCreationDate = TYPES.creation_date_QMARK_;
export const isCreationTime = TYPES.creation_time_QMARK_;
export const isCreationTimestamp = TYPES.creation_timestamp_QMARK_;
export const isCurrency = TYPES.currency_QMARK_;
export const isDescription = TYPES.description_QMARK_;
export const isEmail = TYPES.email_QMARK_;
export const isEntityName = TYPES.entity_name_QMARK_;
export const isForeignKey = TYPES.foreign_key_QMARK_;
export const isID = TYPES.id_QMARK_;
export const isImageURL = TYPES.image_URL_QMARK_;
export const isLocation = TYPES.location_QMARK_;
export const isLatitude = TYPES.latitude_QMARK_;
export const isLongitude = TYPES.longitude_QMARK_;
export const isPrimaryKey = TYPES.primary_key_QMARK_;
export const isState = TYPES.state_QMARK_;
export const isTitle = TYPES.title_QMARK_;
export const isURL = TYPES.URL_QMARK_;
export const isZipCode = TYPES.zip_code_QMARK_;

// TODO (Alex P 2/13/26): rename to jsColumnTypeInfo
export function legacyColumnTypeInfo(column: JsColumnTypeInfo): ColumnTypeInfo {
  return ML.legacy_column__GT_type_info(column);
}

export function isAssignableType(
  column1: ColumnLike,
  column2: ColumnLike,
): boolean {
  return ML.compatible_type_QMARK_(column1, column2);
}

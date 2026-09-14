import * as ML from "cljs/metabase.lib.js";
import type { Metabase_Lib_Types_Isa_TypeInfo } from "cljs/metabase.lib.shared";
import * as TYPES from "cljs/metabase.lib.types.isa";

import type { ColumnMetadata, ColumnTypeInfo, JsColumnTypeInfo } from "./types";

type ColumnLike = ColumnMetadata | ColumnTypeInfo;

// Type guards over the expected column domain: the parameter keeps the
// `ColumnMetadata | ColumnTypeInfo` contract, and the return narrows with the
// generated type-info shape the CLJS predicates guarantee. Type predicates
// cannot be delegated, so each guard declares its own; the factory keeps that
// to a single site.
type TypeFn = (
  column: ColumnLike,
) => column is ColumnLike & Metabase_Lib_Types_Isa_TypeInfo;

const typeFn =
  (check: (column: unknown) => boolean): TypeFn =>
  (column): column is ColumnLike & Metabase_Lib_Types_Isa_TypeInfo =>
    check(column);

// Effective type checks.
export const isBoolean = typeFn(TYPES.boolean_QMARK_);
export const isTemporal = typeFn(TYPES.temporal_QMARK_);
export const isDateOrDateTime = typeFn(TYPES.date_or_datetime_QMARK_);
export const isDateWithoutTime = typeFn(TYPES.date_without_time_QMARK_);
export const isInteger = typeFn(TYPES.integer_QMARK_);
export const isNumeric = typeFn(TYPES.numeric_QMARK_);
export const isString = typeFn(TYPES.string_QMARK_);
export const isStringLike = typeFn(TYPES.string_like_QMARK_);
export const isStringOrStringLike = typeFn(TYPES.string_or_string_like_QMARK_);
export const isTime = typeFn(TYPES.time_QMARK_);

// Semantic type checks. A semantic type can be assigned to a column with an
// unrelated effective type. Do not imply any effective type when checking for a
// semantic type.
export const isAddress = typeFn(TYPES.address_QMARK_);
export const isAvatarURL = typeFn(TYPES.avatar_URL_QMARK_);
export const isCategory = typeFn(TYPES.category_QMARK_);
export const isCity = typeFn(TYPES.city_QMARK_);
export const isComment = typeFn(TYPES.comment_QMARK_);
export const isCoordinate = typeFn(TYPES.coordinate_QMARK_);
export const isCountry = typeFn(TYPES.country_QMARK_);
export const isCreationDate = typeFn(TYPES.creation_date_QMARK_);
export const isCreationTime = typeFn(TYPES.creation_time_QMARK_);
export const isCreationTimestamp = typeFn(TYPES.creation_timestamp_QMARK_);
export const isCurrency = typeFn(TYPES.currency_QMARK_);
export const isDescription = typeFn(TYPES.description_QMARK_);
export const isEmail = typeFn(TYPES.email_QMARK_);
export const isEntityName = typeFn(TYPES.entity_name_QMARK_);
export const isForeignKey = typeFn(TYPES.foreign_key_QMARK_);
export const isID = typeFn(TYPES.id_QMARK_);
export const isImageURL = typeFn(TYPES.image_URL_QMARK_);
export const isLocation = typeFn(TYPES.location_QMARK_);
export const isLatitude = typeFn(TYPES.latitude_QMARK_);
export const isLongitude = typeFn(TYPES.longitude_QMARK_);
export const isPrimaryKey = typeFn(TYPES.primary_key_QMARK_);
export const isState = typeFn(TYPES.state_QMARK_);
export const isTitle = typeFn(TYPES.title_QMARK_);
export const isURL = typeFn(TYPES.URL_QMARK_);
export const isZipCode = typeFn(TYPES.zip_code_QMARK_);

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

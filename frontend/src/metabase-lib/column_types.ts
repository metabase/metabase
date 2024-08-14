import * as ML from "cljs/metabase.lib.js";
import * as TYPES from "cljs/metabase.lib.types.isa";

import type { ColumnMetadata } from "./types";

type TypeFn = (column: ColumnMetadata) => boolean;

export const isAddress: TypeFn = TYPES.address_QMARK_;
export const isAvatarURL: TypeFn = TYPES.avatar_URL_QMARK_;
export const isBoolean: TypeFn = TYPES.boolean_QMARK_;
export const isCategory: TypeFn = TYPES.category_QMARK_;
export const isCity: TypeFn = TYPES.city_QMARK_;
export const isComment: TypeFn = TYPES.comment_QMARK_;
export const isCoordinate: TypeFn = TYPES.coordinate_QMARK_;
export const isCountry: TypeFn = TYPES.country_QMARK_;
export const isCreationDate: TypeFn = TYPES.creation_date_QMARK_;
export const isCreationTime: TypeFn = TYPES.creation_time_QMARK_;
export const isCreationTimestamp: TypeFn = TYPES.creation_timestamp_QMARK_;
export const isCurrency: TypeFn = TYPES.currency_QMARK_;
export const isTemporal: TypeFn = TYPES.temporal_QMARK_;
export const isDateWithoutTime: TypeFn = TYPES.date_without_time_QMARK_;
export const isDescription: TypeFn = TYPES.description_QMARK_;
export const isEmail: TypeFn = TYPES.email_QMARK_;
export const isEntityName: TypeFn = TYPES.entity_name_QMARK_;
export const isForeignKey: TypeFn = TYPES.foreign_key_QMARK_;
export const isID: TypeFn = TYPES.id_QMARK_;
export const isImageURL: TypeFn = TYPES.image_URL_QMARK_;
export const isLocation: TypeFn = TYPES.location_QMARK_;
export const isLatitude: TypeFn = TYPES.latitude_QMARK_;
export const isLongitude: TypeFn = TYPES.longitude_QMARK_;
export const isMetric: TypeFn = TYPES.metric_QMARK_;
export const isInteger: TypeFn = TYPES.integer_QMARK_;
export const isNumber: TypeFn = TYPES.number_QMARK_;
export const isNumeric: TypeFn = TYPES.numeric_QMARK_;
export const isPrimaryKey: TypeFn = TYPES.primary_key_QMARK_;
export const isScope: TypeFn = TYPES.scope_QMARK_;
export const isState: TypeFn = TYPES.state_QMARK_;
export const isString: TypeFn = TYPES.string_QMARK_;
export const isStringLike: TypeFn = TYPES.string_like_QMARK_;
export const isStringOrStringLike: TypeFn = TYPES.string_or_string_like_QMARK_;
export const isSummable: TypeFn = TYPES.summable_QMARK_;
export const isTime: TypeFn = TYPES.time_QMARK_;
export const isTitle: TypeFn = TYPES.title_QMARK_;
export const isURL: TypeFn = TYPES.URL_QMARK_;
export const isZipCode: TypeFn = TYPES.zip_code_QMARK_;

export function isAssignableType(
  column1: ColumnMetadata,
  column2: ColumnMetadata,
): boolean {
  return ML.valid_filter_for_QMARK_(column1, column2);
}

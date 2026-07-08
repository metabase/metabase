/**
 * Column type predicates.
 *
 * At runtime inside a plugin bundle, these delegate to
 * `window.__METABASE_VIZ_API__.columnTypes` which is set by Metabase
 * before the plugin executes.
 *
 * During development (type-checking, IDE), the types are what matter —
 * the runtime delegation is only exercised inside the browser.
 */
import type { ColumnPredicate, ColumnTypes } from "./types/column-types";
import type { Column } from "./types/data";

declare const window: { __METABASE_VIZ_API__?: { columnTypes: ColumnTypes } };

function ct(): ColumnTypes {
  const api = window.__METABASE_VIZ_API__;
  if (!api) {
    throw new Error(
      // eslint-disable-next-line metabase/no-literal-metabase-strings
      "Metabase Viz API not initialized. Column type functions can only be called inside a running Metabase instance.",
    );
  }
  return api.columnTypes;
}

export const isDate: ColumnPredicate = (col) => ct().isDate(col);
export const isNumeric: ColumnPredicate = (col) => ct().isNumeric(col);
export const isInteger: ColumnPredicate = (col) => ct().isInteger(col);
export const isBoolean: ColumnPredicate = (col) => ct().isBoolean(col);
export const isString: ColumnPredicate = (col) => ct().isString(col);
export const isStringLike: ColumnPredicate = (col) => ct().isStringLike(col);
export const isSummable: ColumnPredicate = (col) => ct().isSummable(col);
export const isNumericBaseType: ColumnPredicate = (col) =>
  ct().isNumericBaseType(col);
export const isDateWithoutTime: ColumnPredicate = (col) =>
  ct().isDateWithoutTime(col);
export const isNumber: ColumnPredicate = (col) => ct().isNumber(col);
export const isFloat: ColumnPredicate = (col) => ct().isFloat(col);
export const isTime: ColumnPredicate = (col) => ct().isTime(col);
export const isFK: ColumnPredicate = (col) => ct().isFK(col);
export const isPK: ColumnPredicate = (col) => ct().isPK(col);
export const isEntityName: ColumnPredicate = (col) => ct().isEntityName(col);
export const isTitle: ColumnPredicate = (col) => ct().isTitle(col);
export const isProduct: ColumnPredicate = (col) => ct().isProduct(col);
export const isSource: ColumnPredicate = (col) => ct().isSource(col);
export const isAddress: ColumnPredicate = (col) => ct().isAddress(col);
export const isScore: ColumnPredicate = (col) => ct().isScore(col);
export const isQuantity: ColumnPredicate = (col) => ct().isQuantity(col);
export const isCategory: ColumnPredicate = (col) => ct().isCategory(col);
export const isAny: ColumnPredicate = (col) => ct().isAny(col);
export const isState: ColumnPredicate = (col) => ct().isState(col);
export const isCountry: ColumnPredicate = (col) => ct().isCountry(col);
export const isCoordinate: ColumnPredicate = (col) => ct().isCoordinate(col);
export const isLatitude: ColumnPredicate = (col) => ct().isLatitude(col);
export const isLongitude: ColumnPredicate = (col) => ct().isLongitude(col);
export const isCurrency: ColumnPredicate = (col) => ct().isCurrency(col);
export const isPercentage: ColumnPredicate = (col) => ct().isPercentage(col);
export const isID: ColumnPredicate = (col) => ct().isID(col);
export const isURL: ColumnPredicate = (col) => ct().isURL(col);
export const isEmail: ColumnPredicate = (col) => ct().isEmail(col);
export const isAvatarURL: ColumnPredicate = (col) => ct().isAvatarURL(col);
export const isImageURL: ColumnPredicate = (col) => ct().isImageURL(col);
export const hasLatitudeAndLongitudeColumns: (cols: Column[]) => boolean = (
  cols,
) => ct().hasLatitudeAndLongitudeColumns(cols);

export type { ColumnPredicate, ColumnTypes };

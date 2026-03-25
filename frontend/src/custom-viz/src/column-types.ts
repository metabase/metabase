/**
 * Column type predicates.
 *
 * These are stub implementations that provide TypeScript types for plugin
 * development. At runtime, the Vite `metabaseVizExternals` plugin replaces
 * imports from "@metabase/custom-viz/column-types" with virtual modules that
 * read from `window.__METABASE_VIZ_API__.columnTypes`.
 */
import type { ColumnPredicate, ColumnTypes } from "./types/column-types";
import type { Column } from "./types/data";

const stub: ColumnPredicate = () => false;

export const isDate = stub;
export const isNumeric = stub;
export const isInteger = stub;
export const isBoolean = stub;
export const isString = stub;
export const isStringLike = stub;
export const isSummable = stub;
export const isNumericBaseType = stub;
export const isDateWithoutTime = stub;
export const isNumber = stub;
export const isFloat = stub;
export const isTime = stub;
export const isFK = stub;
export const isPK = stub;
export const isEntityName = stub;
export const isTitle = stub;
export const isProduct = stub;
export const isSource = stub;
export const isAddress = stub;
export const isScore = stub;
export const isQuantity = stub;
export const isCategory = stub;
export const isAny = stub;
export const isState = stub;
export const isCountry = stub;
export const isCoordinate = stub;
export const isLatitude = stub;
export const isLongitude = stub;
export const isCurrency = stub;
export const isPercentage = stub;
export const isID = stub;
export const isURL = stub;
export const isEmail = stub;
export const isAvatarURL = stub;
export const isImageURL = stub;
export const hasLatitudeAndLongitudeColumns: (cols: Column[]) => boolean =
  () => false;

export type { ColumnPredicate, ColumnTypes };

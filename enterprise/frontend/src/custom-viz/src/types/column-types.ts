import type { Column } from "./data";

export type ColumnPredicate = (column: Column | null | undefined) => boolean;

export interface ColumnTypes {
  isDate: ColumnPredicate;
  isNumeric: ColumnPredicate;
  isInteger: ColumnPredicate;
  isBoolean: ColumnPredicate;
  isString: ColumnPredicate;
  isStringLike: ColumnPredicate;
  isSummable: ColumnPredicate;
  isNumericBaseType: ColumnPredicate;
  isDateWithoutTime: ColumnPredicate;
  isNumber: ColumnPredicate;
  isFloat: ColumnPredicate;
  isTime: ColumnPredicate;
  isFK: ColumnPredicate;
  isPK: ColumnPredicate;
  isEntityName: ColumnPredicate;
  isTitle: ColumnPredicate;
  isProduct: ColumnPredicate;
  isSource: ColumnPredicate;
  isAddress: ColumnPredicate;
  isScore: ColumnPredicate;
  isQuantity: ColumnPredicate;
  isCategory: ColumnPredicate;
  isAny: ColumnPredicate;
  isState: ColumnPredicate;
  isCountry: ColumnPredicate;
  isCoordinate: ColumnPredicate;
  isLatitude: ColumnPredicate;
  isLongitude: ColumnPredicate;
  isCurrency: ColumnPredicate;
  isPercentage: ColumnPredicate;
  isID: ColumnPredicate;
  isURL: ColumnPredicate;
  isEmail: ColumnPredicate;
  isAvatarURL: ColumnPredicate;
  isImageURL: ColumnPredicate;
  hasLatitudeAndLongitudeColumns: (cols: Column[]) => boolean;
}

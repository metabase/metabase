import * as Lib from "metabase-lib";

export const getColumnExample = (
  column: Lib.ColumnMetadata | string | null,
): string => {
  if (!column) {
    return "";
  }
  if (typeof column === "string") {
    return column;
  }

  if (Lib.isEmail(column)) {
    return "email@example.com";
  }

  if (Lib.isURL(column)) {
    return "https://www.example.com";
  }

  if (Lib.isBoolean(column)) {
    return "true";
  }

  if (Lib.isID(column)) {
    return "12345";
  }

  if (Lib.isInteger(column)) {
    return "123";
  }

  if (Lib.isNumeric(column)) {
    return "123.45678901234567";
  }

  if (Lib.isDateWithoutTime(column)) {
    return "2042-01-01";
  }

  if (Lib.isDateOrDateTime(column)) {
    return "2042-01-01 12:34:56.789";
  }

  if (Lib.isTime(column)) {
    return "12:34:56.789";
  }

  if (Lib.isLatitude(column) || Lib.isLongitude(column)) {
    return "-12.34567";
  }

  return "text";
};

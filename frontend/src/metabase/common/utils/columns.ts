import type { IconName } from "metabase/ui";
import * as Lib from "metabase-lib";

export function getColumnIcon(column: Lib.ColumnMetadata): IconName {
  if (Lib.isPrimaryKey(column)) {
    return "label";
  }
  if (Lib.isForeignKey(column)) {
    return "connections";
  }

  if (
    Lib.isLocation(column) ||
    Lib.isLatitude(column) ||
    Lib.isLongitude(column)
  ) {
    return "location";
  }

  if (
    Lib.isTemporal(column) ||
    Lib.isDateWithoutTime(column) ||
    Lib.isTime(column)
  ) {
    return "calendar";
  }

  // Wide type checks should go last,
  // as PK/FK/Location/Date, etc. are also strings, numbers, etc.
  if (Lib.isBoolean(column)) {
    return "io";
  }
  if (Lib.isStringOrStringLike(column)) {
    return "string";
  }
  if (Lib.isNumeric(column)) {
    return "int";
  }

  return "list";
}

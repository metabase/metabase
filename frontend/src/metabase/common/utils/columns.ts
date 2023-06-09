import * as Lib from "metabase-lib";
import type { IconName } from "metabase/core/components/Icon";

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
    Lib.isDate(column) ||
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
  if (Lib.isString(column)) {
    return "string";
  }
  if (Lib.isNumeric(column)) {
    return "int";
  }

  return "unknown";
}

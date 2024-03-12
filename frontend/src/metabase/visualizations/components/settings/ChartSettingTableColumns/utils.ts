import * as Lib from "metabase-lib";

export function canEditQuery(query?: Lib.Query) {
  if (!query) {
    return false;
  }
  const { isNative, isEditable } = Lib.queryDisplayInfo(query);
  return !isNative && isEditable;
}

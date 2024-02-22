import * as Lib from "metabase-lib";

export function canEditQuery(query: Lib.Query, isDashboard?: boolean) {
  const { isNative, isEditable } = Lib.queryDisplayInfo(query);
  return !isNative && isEditable && !isDashboard;
}

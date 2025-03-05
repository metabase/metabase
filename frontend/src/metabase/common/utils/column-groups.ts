import type { IconName } from "metabase/ui";
import type { ColumnGroupDisplayInfo } from "metabase-lib";

export function getColumnGroupIcon(
  groupInfo: ColumnGroupDisplayInfo,
): IconName {
  if (groupInfo.isSourceTable) {
    return "table";
  }
  if (groupInfo.isFromJoin) {
    return "join_left_outer";
  }
  if (groupInfo.isImplicitlyJoinable) {
    return "connections";
  }
  if (groupInfo.isSourceCard) {
    return groupInfo.isModel ? "model" : "table";
  }
  if (groupInfo.isMainGroup) {
    return "sum";
  }
  return "table";
}

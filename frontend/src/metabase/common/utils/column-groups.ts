import type { ColumnGroupDisplayInfo } from "metabase-lib";
import type { IconName } from "metabase-types/api";

export function getColumnGroupIcon(
  groupInfo: ColumnGroupDisplayInfo,
): IconName {
  if (groupInfo.isSourceTable) {
    return "table";
  }
  if (groupInfo.isSourceCard) {
    return "table2";
  }
  if (groupInfo.isFromJoin) {
    return "join_left_outer";
  }
  if (groupInfo.isImplicitlyJoinable) {
    return "connections";
  }
  if (groupInfo.isQuestion) {
    return "question";
  }
  if (groupInfo.isModel) {
    return "model";
  }
  if (groupInfo.isMetric) {
    return "metric";
  }
  if (groupInfo.isMainGroup) {
    return "sum";
  }
  return "table";
}

import { singularize } from "metabase/lib/formatting";
import type { IconName } from "metabase/core/components/Icon";
import type { ColumnGroupDisplayInfo } from "metabase-lib/types";

export function getColumnGroupName(groupInfo: ColumnGroupDisplayInfo) {
  return groupInfo.fkReferenceName || singularize(groupInfo.displayName);
}

export function getColumnGroupIcon(
  groupInfo: ColumnGroupDisplayInfo,
): IconName | undefined {
  if (groupInfo.isSourceTable) {
    return "table";
  }
  if (groupInfo.isFromJoin) {
    return "join_left_outer";
  }
  if (groupInfo.isImplicitlyJoinable) {
    return "connections";
  }
  return;
}

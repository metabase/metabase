import { singularize } from "metabase/lib/formatting";
import type { IconName } from "metabase/core/components/Icon";
import type { ColumnDisplayInfo, TableDisplayInfo } from "metabase-lib/types";

export function getColumnGroupName(
  groupInfo: ColumnDisplayInfo | TableDisplayInfo,
) {
  const columnInfo = groupInfo as ColumnDisplayInfo;
  const tableInfo = groupInfo as TableDisplayInfo;
  return columnInfo.fkReferenceName || singularize(tableInfo.displayName);
}

export function getColumnGroupIcon(
  groupInfo: ColumnDisplayInfo | TableDisplayInfo,
): IconName | undefined {
  if ((groupInfo as TableDisplayInfo).isSourceTable) {
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

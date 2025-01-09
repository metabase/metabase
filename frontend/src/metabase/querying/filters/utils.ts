import type * as Lib from "metabase-lib";

export function getGroupName(
  groupInfo: Lib.ColumnGroupDisplayInfo,
  stageIndex: number,
) {
  return groupInfo.isMainGroup && stageIndex > 1
    ? `${groupInfo.displayName} (${stageIndex})`
    : groupInfo.displayName;
}

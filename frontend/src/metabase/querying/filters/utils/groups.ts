import { t } from "ttag";

import type * as Lib from "metabase-lib";

export function getGroupName(
  groupInfo: Lib.ColumnGroupDisplayInfo,
  stageIndex: number,
  isLimited?: boolean,
) {
  if (isLimited) {
    return t`Result columns`;
  }

  return groupInfo.isMainGroup && stageIndex > 1
    ? `${groupInfo.displayName} (${stageIndex})`
    : groupInfo.displayName;
}

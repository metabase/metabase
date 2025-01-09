import type * as Lib from "metabase-lib";

import type { FilterOperatorOption } from "./types";

export function getGroupName(
  groupInfo: Lib.ColumnGroupDisplayInfo,
  stageIndex: number,
) {
  return groupInfo.isMainGroup && stageIndex > 1
    ? `${groupInfo.displayName} (${stageIndex})`
    : groupInfo.displayName;
}

export function getDefaultAvailableOperator<T extends Lib.FilterOperatorName>(
  options: FilterOperatorOption<T>[],
  desiredOperator?: T,
): T {
  return (
    options.find(option => option.operator === desiredOperator)?.operator ??
    options[0].operator
  );
}

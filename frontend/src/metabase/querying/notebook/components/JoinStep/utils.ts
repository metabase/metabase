import type * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

const JOIN_ICONS: Record<string, IconName> = {
  "left-join": "join_left_outer",
  "right-join": "join_right_outer",
  "inner-join": "join_inner",
  "full-join": "join_full_outer",
};

export function getJoinStrategyIcon(strategyInfo: Lib.JoinStrategyDisplayInfo) {
  return JOIN_ICONS[strategyInfo.shortName];
}

import * as Lib from "metabase-lib";

export function getDefaultJoinStrategy(
  query: Lib.Query,
  stageIndex: number,
): Lib.JoinStrategy {
  const strategies = Lib.availableJoinStrategies(query, stageIndex);
  const defaultStrategy = strategies.find(
    strategy => Lib.displayInfo(query, stageIndex, strategy).default,
  );
  return defaultStrategy || strategies[0];
}

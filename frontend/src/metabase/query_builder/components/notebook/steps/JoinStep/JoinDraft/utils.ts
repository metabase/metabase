import * as Lib from "metabase-lib";

export function getDefaultJoinStrategy(
  query: Lib.Query,
  stageIndex: number,
): Lib.JoinStrategy {
  const strategies = Lib.availableJoinStrategies(query, stageIndex);
  const defaultStrategy = strategies.find(
    strategy => Lib.displayInfo(query, stageIndex, strategy).default,
  );
  return defaultStrategy ?? strategies[0];
}

export function getJoinFields(
  columns: Lib.ColumnMetadata[],
  selectedColumns: Lib.ColumnMetadata[],
): Lib.JoinFields {
  if (columns.length === selectedColumns.length) {
    return "all";
  } else if (selectedColumns.length === 0) {
    return "none";
  } else {
    return selectedColumns;
  }
}

import * as Lib from "./v2";

export function useMetabaseLib(query: Lib.Query, stageIndex: number) {
  return {
    // Binning
    binning: Lib.binning,
    availableBinningStrategies: (column: Lib.ColumnMetadata) =>
      Lib.availableBinningStrategies(query, stageIndex, column),
    isBinnable: (column: Lib.ColumnMetadata) =>
      Lib.isBinnable(query, stageIndex, column),
    withBinning: Lib.withBinning,
    withDefaultBinning: (column: Lib.ColumnMetadata) =>
      Lib.withDefaultBinning(query, stageIndex, column),

    // Breakout
    breakoutableColumns: () => Lib.breakoutableColumns(query, stageIndex),
    breakouts: () => Lib.breakouts(query, stageIndex),
    breakout: (column: Lib.ColumnMetadata) =>
      Lib.breakout(query, stageIndex, column),

    // Temporal bucket
    temporalBucket: Lib.temporalBucket,
    availableTemporalBucketingStrategies: (column: Lib.ColumnMetadata) =>
      Lib.availableTemporalBuckets(query, stageIndex, column),
    isTemporalBucketable: (column: Lib.ColumnMetadata) =>
      Lib.isTemporalBucketable(query, stageIndex, column),
    withTemporalBucket: Lib.withTemporalBucket,
    withDefaultTemporalBucket: (column: Lib.ColumnMetadata) =>
      Lib.withDefaultTemporalBucket(query, stageIndex, column),

    // Metadata
    displayInfo: Lib.displayInfo.bind(null, query, stageIndex),
    groupColumns: Lib.groupColumns,
    getColumnsFromColumnGroup: Lib.getColumnsFromColumnGroup,

    // Query
    replaceClause: (
      targetClause: Lib.Clause,
      newClause: Lib.Clause | Lib.ColumnMetadata,
    ) => Lib.replaceClause(query, stageIndex, targetClause, newClause),
    removeClause: (clause: Lib.Clause) =>
      Lib.removeClause(query, stageIndex, clause),
  };
}

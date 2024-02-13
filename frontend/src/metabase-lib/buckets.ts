import { binning, isBinnable, withDefaultBinning } from "./binning";
import {
  temporalBucket,
  isTemporalBucketable,
  withDefaultTemporalBucket,
} from "./temporal_bucket";
import type { ColumnMetadata, Query } from "./types";

export function withDefaultBucket(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
): ColumnMetadata {
  if (isBinnable(query, stageIndex, column)) {
    const isBinned = binning(column) != null;
    return isBinned ? column : withDefaultBinning(query, stageIndex, column);
  }
  if (isTemporalBucketable(query, stageIndex, column)) {
    const isBucketed = temporalBucket(column) != null;
    return isBucketed
      ? column
      : withDefaultTemporalBucket(query, stageIndex, column);
  }
  return column;
}

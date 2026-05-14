import { t } from "ttag";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { TemporalUnit } from "metabase-types/api";

import { LAST_QUERY_STAGE_INDEX } from "./constants";

type UpdateQuestion = (question: Question, opts: { run: boolean }) => void;

export interface TemporalGranularityItem {
  bucket: Lib.Bucket;
  unit: TemporalUnit;
  label: string;
}

export interface UseTemporalGranularityResult {
  temporalColumn: Lib.ColumnMetadata | null;
  rawTemporalColumn: Lib.ColumnMetadata | null;
  currentUnit: TemporalUnit | undefined;
  availableItems: TemporalGranularityItem[];
  bucketLabel: string;
  handleBucketChange: (bucket: Lib.Bucket | null) => void;
}

/**
 * Handlers for showing and updating time granularity controls
 * via the query explorer bar.
 */
export function useTemporalGranularity(
  question: Question | undefined,
  updateQuestion: UpdateQuestion,
): UseTemporalGranularityResult {
  if (!question) {
    return {
      temporalColumn: null,
      rawTemporalColumn: null,
      currentUnit: undefined,
      availableItems: [],
      bucketLabel: t`All time`,
      handleBucketChange: () => {},
    };
  }

  const query = question.query();
  const stageIndex = LAST_QUERY_STAGE_INDEX;

  const breakoutClauses = Lib.breakouts(query, stageIndex);

  let temporalClause: Lib.BreakoutClause | null = null;
  let temporalColumn: Lib.ColumnMetadata | null = null;

  for (const clause of breakoutClauses) {
    const column = Lib.breakoutColumn(query, stageIndex, clause);

    if (column && Lib.isTemporalBucketable(query, stageIndex, column)) {
      temporalClause = clause;
      temporalColumn = column;
      break;
    }
  }

  // Strip the temporal bucket from the column — date filters operate on the
  // raw date column, not the bucketed version used in the breakout.
  const rawTemporalColumn = temporalColumn
    ? Lib.withTemporalBucket(temporalColumn, null)
    : null;

  const currentBucket = temporalColumn
    ? Lib.temporalBucket(temporalColumn)
    : null;

  const currentUnit = currentBucket
    ? (Lib.displayInfo(query, stageIndex, currentBucket)
        .shortName as TemporalUnit)
    : undefined;

  const availableBuckets = temporalColumn
    ? Lib.availableTemporalBuckets(query, stageIndex, temporalColumn)
    : [];

  const availableItems: TemporalGranularityItem[] = availableBuckets.map(
    (bucket) => {
      const info = Lib.displayInfo(query, stageIndex, bucket);
      const unit = info.shortName as TemporalUnit;

      return { bucket, unit, label: Lib.describeTemporalUnit(unit) };
    },
  );

  const bucketLabel = currentUnit
    ? t`by ${Lib.describeTemporalUnit(currentUnit).toLowerCase()}`
    : t`All time`;

  const handleBucketChange = (bucket: Lib.Bucket | null) => {
    if (!temporalClause || !temporalColumn) {
      return;
    }

    const newColumn = Lib.withTemporalBucket(temporalColumn, bucket);
    const newQuery = Lib.replaceClause(
      query,
      stageIndex,
      temporalClause,
      newColumn,
    );

    updateQuestion(question.setQuery(newQuery), { run: true });
  };

  return {
    temporalColumn,
    rawTemporalColumn,
    currentUnit,
    availableItems,
    bucketLabel,
    handleBucketChange,
  };
}

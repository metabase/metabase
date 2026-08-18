import { skipToken, useGetCardQuery, useGetMeasureQuery } from "metabase/api";
import {
  type ResolvedGoalValue,
  resolveGoalValue,
} from "metabase/visualizations/lib/dynamic-goals";
import type { DatasetData, GoalValue } from "metabase-types/api";
import { isGoalForeignColumnRef } from "metabase-types/guards";

const RESOLVING: ResolvedGoalValue = {
  value: null,
  isResolving: true,
};

/**
 * Like `resolveGoalValue`, but a foreign column missing from the dataset
 * is reported as still-resolving rather than an error, while the referenced
 * entity's current metadata says the column exists: the dataset just predates
 * the reference, and the settings change that introduced it re-runs the query.
 */
export function useResolvedGoalValue(
  data: DatasetData | undefined,
  value: GoalValue | null,
): ResolvedGoalValue {
  const resolved =
    data == null ? { value: null } : resolveGoalValue(data, value);
  const missingColumnRef =
    isGoalForeignColumnRef(value) &&
    resolved.error?.reason === "column-not-found"
      ? value
      : null;

  const { data: card, isError: isCardError } = useGetCardQuery(
    missingColumnRef?.type === "card" ? { id: missingColumnRef.id } : skipToken,
  );

  const { data: measure, isError: isMeasureError } = useGetMeasureQuery(
    missingColumnRef?.type === "measure" ? missingColumnRef.id : skipToken,
  );

  if (missingColumnRef == null) {
    return resolved;
  }

  if (missingColumnRef.type === "card") {
    if (isCardError) {
      return resolved;
    }

    if (card == null) {
      return RESOLVING;
    }

    const columnExists = (card.result_metadata ?? []).some(
      (column) => column.name === missingColumnRef.column,
    );

    return columnExists ? RESOLVING : resolved;
  }

  if (isMeasureError) {
    return resolved;
  }

  if (measure == null) {
    return RESOLVING;
  }

  return measure.result_column_name === missingColumnRef.column
    ? RESOLVING
    : resolved;
}

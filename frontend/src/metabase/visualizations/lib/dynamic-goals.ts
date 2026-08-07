import type {
  DatasetData,
  GoalForeignColumnRef,
  GoalSegment,
  GoalValue,
  ReferencedEntityType,
  RowValue,
} from "metabase-types/api";
import { isGoalSelfColumnRef, isGoalStaticValue } from "metabase-types/guards";

import { segmentIsValid } from "./utils";

/** A gauge segment whose bounds have been resolved to concrete numbers. */
export type ResolvedGoalSegment = {
  color: string;
  label?: string;
  min: number;
  max: number;
};

export type GoalRefErrorReason =
  | "query-failed"
  | "column-not-found"
  | "not-a-number";

export type GoalRefError = {
  type?: ReferencedEntityType;
  id?: number;
  column: string;
  reason: GoalRefErrorReason;
};

export type ResolvedGoalValue = {
  value: number | null;
  error?: GoalRefError;
  // referenced results not delivered yet (query still running) - not an error
  isResolving?: boolean;
};

export const resolveGoalValue = (
  goalValue: GoalValue | null | undefined,
  data: DatasetData,
): ResolvedGoalValue => {
  if (goalValue == null) {
    return { value: null };
  }

  if (isGoalStaticValue(goalValue)) {
    return { value: goalValue };
  }

  if (isGoalSelfColumnRef(goalValue)) {
    return resolveSelfColumnValue(goalValue, data);
  }

  return resolveForeignColumnRef(goalValue, data);
};

const resolveSelfColumnValue = (
  columnName: string,
  data: DatasetData,
): ResolvedGoalValue => {
  const columnIndex = data.cols.findIndex(
    (column) => column.name === columnName,
  );

  if (columnIndex === -1) {
    return {
      value: null,
      error: {
        column: columnName,
        reason: "column-not-found",
      },
    };
  }

  const value = toNumberOrNull(data.rows[0]?.[columnIndex]);

  if (value == null) {
    return {
      value: null,
      error: {
        column: columnName,
        reason: "not-a-number",
      },
    };
  }

  return { value };
};

const resolveForeignColumnRef = (
  { type, id, column }: GoalForeignColumnRef,
  data: DatasetData,
): ResolvedGoalValue => {
  // A missing entry means the current results predate this reference (the
  // query re-runs after a settings change): treat as still resolving without
  // surfacing an error.
  const result = data.referenced_entities?.[type]?.[id];
  if (result == null) {
    return { value: null, isResolving: true };
  }

  if (result.status !== "completed" || result.data == null) {
    return {
      value: null,
      error: { type, id, column, reason: "query-failed" },
    };
  }

  const columnIndex = result.data.cols.findIndex(
    (resultColumn) => resultColumn.name === column,
  );

  // The server narrows each entity to the columns the request asked for, so a
  // column we didn't get means these results were fetched for a different
  // reference - same "predates the reference" case as a missing entry above.
  if (columnIndex === -1) {
    return { value: null, isResolving: true };
  }

  const value = toNumberOrNull(result.data.rows[0]?.[columnIndex]);

  if (value == null) {
    return {
      value: null,
      error: { type, id, column, reason: "not-a-number" },
    };
  }

  return { value };
};

const toNumberOrNull = (raw: RowValue | undefined): number | null =>
  typeof raw === "number" && Number.isFinite(raw) ? raw : null;

/** Resolves the possibly dynamic min/max of every gauge segment to concrete numbers. */
export const resolveGoalSegments = (
  segments: GoalSegment[] | undefined,
  data: DatasetData,
): ResolvedGoalSegment[] => {
  if (!Array.isArray(segments)) {
    return [];
  }

  return segments.flatMap((segment) => {
    const min = resolveGoalValue(segment.min, data).value;
    const max = resolveGoalValue(segment.max, data).value;

    if (min == null || max == null || !segmentIsValid({ min, max })) {
      return [];
    }

    return [{ color: segment.color, label: segment.label, min, max }];
  });
};

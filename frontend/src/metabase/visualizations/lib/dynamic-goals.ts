import type {
  CardId,
  DatasetData,
  GoalForeignColumnRef,
  GoalValue,
  ReferencedCard,
  ResolvedGoalSegment,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";
import {
  isGoalForeignColumnRef,
  isGoalSelfColumnRef,
  isGoalStaticValue,
  isGoalValue,
  isObject,
  isResolvedGoalSegment,
} from "metabase-types/guards";

import { segmentIsValid } from "./utils";

export type GoalRefErrorReason =
  | "query-failed"
  | "column-not-found"
  | "not-a-number";

export type GoalRefError = {
  card_id?: CardId;
  column: string;
  reason: GoalRefErrorReason;
};

export type ResolvedGoalValue = {
  value: number | null;
  error?: GoalRefError;
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
  goalForeignColumnRef: GoalForeignColumnRef,
  data: DatasetData,
): ResolvedGoalValue => {
  // Referenced results are not available yet (e.g. still loading): treat as
  // unresolved without surfacing an error to avoid transient error toasts.
  if (data.referenced_cards == null) {
    return { value: null };
  }

  const result = data.referenced_cards?.[goalForeignColumnRef.card_id];
  if (result == null || result.status !== "completed" || result.data == null) {
    return {
      value: null,
      error: {
        card_id: goalForeignColumnRef.card_id,
        column: goalForeignColumnRef.column,
        reason: "query-failed",
      },
    };
  }

  const columnIndex = result.data.cols.findIndex(
    (column) => column.name === goalForeignColumnRef.column,
  );

  if (columnIndex === -1) {
    return {
      value: null,
      error: {
        card_id: goalForeignColumnRef.card_id,
        column: goalForeignColumnRef.column,
        reason: "column-not-found",
      },
    };
  }

  const value = toNumberOrNull(result.data.rows[0]?.[columnIndex]);

  if (value == null) {
    return {
      value: null,
      error: {
        card_id: goalForeignColumnRef.card_id,
        column: goalForeignColumnRef.column,
        reason: "not-a-number",
      },
    };
  }

  return { value };
};

const toNumberOrNull = (raw: RowValue | undefined): number | null => {
  if (typeof raw === "number" && !Number.isNaN(raw) && Number.isFinite(raw)) {
    return raw;
  }

  return null;
};

export const getReferencedCardsFromVizSettings = (
  settings: VisualizationSettings,
): ReferencedCard[] => {
  const sources = getSegmentGoalValues(settings["gauge.segments"]).filter(
    isGoalForeignColumnRef,
  );

  const columnsByCard = sources.reduce((map, source) => {
    const columns = map.get(source.card_id) ?? new Set<string>();
    columns.add(source.column);
    map.set(source.card_id, columns);
    return map;
  }, new Map<CardId, Set<string>>());

  return Array.from(columnsByCard, ([cardId, columns]) => ({
    card_id: cardId,
    columns: Array.from(columns),
  }));
};

// TODO: unknown
const getSegmentGoalValues = (rawSegments: unknown[]): unknown[] => {
  if (!Array.isArray(rawSegments)) {
    return [];
  }

  return rawSegments.flatMap((segment) =>
    isObject(segment) ? [segment.min, segment.max] : [],
  );
};

type ResolvedGoalSegments = {
  segments: ResolvedGoalSegment[];
  errors: GoalRefError[];
};

// Resolves the possibly dynamic min/max of every gauge segment to concrete numbers
export const resolveGoalSegments = (
  rawSegments: unknown, // TODO: unknown
  data: DatasetData,
): ResolvedGoalSegments => {
  if (!Array.isArray(rawSegments)) {
    return { segments: [], errors: [] };
  }

  const errors: GoalRefError[] = [];
  const segments: ResolvedGoalSegment[] = [];

  for (const rawSegment of rawSegments) {
    if (!isObject(rawSegment)) {
      continue;
    }

    const min = resolveGoalValue(
      isGoalValue(rawSegment.min) ? rawSegment.min : null,
      data,
    );
    const max = resolveGoalValue(
      isGoalValue(rawSegment.max) ? rawSegment.max : null,
      data,
    );

    if (min.error) {
      errors.push(min.error);
    }

    if (max.error) {
      errors.push(max.error);
    }

    const resolvedSegment = {
      color:
        typeof rawSegment.color === "string" ? rawSegment.color : undefined,
      label:
        typeof rawSegment.label === "string" ? rawSegment.label : undefined,
      min: min.value,
      max: max.value,
    };

    if (
      isResolvedGoalSegment(resolvedSegment) &&
      segmentIsValid(resolvedSegment)
    ) {
      segments.push(resolvedSegment);
    }
  }

  return { segments, errors };
};

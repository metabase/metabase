import type {
  CardId,
  DatasetData,
  GoalForeignColumnRef,
  GoalValue,
  MeasureId,
  ReferencedEntity,
  ReferencedEntityType,
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
  // surfacing an error to avoid transient error toasts.
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

  if (columnIndex === -1) {
    return {
      value: null,
      error: { type, id, column, reason: "column-not-found" },
    };
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

const toNumberOrNull = (raw: RowValue | undefined): number | null => {
  if (typeof raw === "number" && !Number.isNaN(raw) && Number.isFinite(raw)) {
    return raw;
  }

  return null;
};

type ReferencedEntityColumns =
  | { type: "card"; id: CardId; columns: Set<string> }
  | { type: "measure"; id: MeasureId; columns: Set<string> };

export const getReferencedEntitiesFromVizSettings = (
  settings: VisualizationSettings,
): ReferencedEntity[] => {
  const refs = getSegmentGoalValues(settings["gauge.segments"]).filter(
    isGoalForeignColumnRef,
  );

  const columnsByEntity = refs.reduce((map, ref) => {
    const key = `${ref.type}:${ref.id}`;
    const entry = map.get(key) ?? {
      type: ref.type,
      id: ref.id,
      columns: new Set<string>(),
    };
    entry.columns.add(ref.column);
    map.set(key, entry);
    return map;
  }, new Map<string, ReferencedEntityColumns>());

  return Array.from(columnsByEntity.values(), ({ type, id, columns }) => ({
    type,
    id,
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

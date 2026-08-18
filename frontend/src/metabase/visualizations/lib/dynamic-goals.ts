import { t } from "ttag";

import type {
  CardId,
  DatasetData,
  GoalForeignColumnRef,
  GoalSegment,
  GoalValue,
  MeasureId,
  ReferencedEntity,
  ReferencedEntityType,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";
import {
  isGoalForeignColumnRef,
  isGoalSelfColumnRef,
  isGoalStaticValue,
} from "metabase-types/guards";

import { segmentIsValid } from "./utils";

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

export type GoalRefError =
  | {
      type?: Extract<ReferencedEntityType, "card">;
      id?: CardId;
      column: string;
      reason: GoalRefErrorReason;
      message?: string;
    }
  | {
      type?: Extract<ReferencedEntityType, "measure">;
      id?: MeasureId;
      column: string;
      reason: GoalRefErrorReason;
      message?: string;
    };

export type ResolvedGoalValue = {
  value: number | null;
  error?: GoalRefError;
  isResolving?: boolean;
};

export function resolveGoalValue(
  data: DatasetData,
  goalValue: GoalValue | null | undefined,
): ResolvedGoalValue {
  if (goalValue == null) {
    return { value: null };
  }

  if (isGoalStaticValue(goalValue)) {
    return { value: goalValue };
  }

  if (isGoalSelfColumnRef(goalValue)) {
    return resolveSelfColumnValue(data, goalValue);
  }

  return resolveForeignColumnRef(data, goalValue);
}

function resolveSelfColumnValue(
  data: DatasetData,
  columnName: string,
): ResolvedGoalValue {
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
}

function resolveForeignColumnRef(
  data: DatasetData,
  { type, id, column }: GoalForeignColumnRef,
): ResolvedGoalValue {
  const result = data.referenced_entities?.[type]?.[id];

  if (result == null) {
    return { value: null, isResolving: true };
  }

  if (result.status === "failed" || result.data == null) {
    return {
      value: null,
      error: {
        type,
        id,
        column,
        reason: "query-failed",
        message: result.error,
      },
    };
  }

  const columnIndex = result.data.cols.findIndex(
    (resultColumn) => resultColumn.name === column,
  );

  if (columnIndex === -1) {
    return {
      value: null,
      error: {
        type,
        id,
        column,
        reason: "column-not-found",
        message: t`Column not found`,
      },
    };
  }

  const value = toNumberOrNull(result.data.rows[0]?.[columnIndex]);

  if (value == null) {
    return {
      value: null,
      error: {
        type,
        id,
        column,
        reason: "not-a-number",
        message: t`Column value is not a number`,
      },
    };
  }

  return { value };
}

function toNumberOrNull(raw: RowValue | undefined): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

export function resolveGoalSegments(
  data: DatasetData,
  segments: GoalSegment[] | undefined,
): ResolvedGoalSegment[] {
  if (!Array.isArray(segments)) {
    return [];
  }

  return segments.flatMap((segment) => {
    const min = resolveGoalValue(data, segment.min).value;
    const max = resolveGoalValue(data, segment.max).value;

    if (min == null || max == null || !segmentIsValid({ min, max })) {
      return [];
    }

    return [{ color: segment.color, label: segment.label, min, max }];
  });
}

export function getGoalSegmentErrors(
  data: DatasetData,
  segments: GoalSegment[] | undefined,
): GoalRefError[] {
  if (!Array.isArray(segments)) {
    return [];
  }

  return segments.flatMap((segment) => {
    return [segment.min, segment.max].flatMap((bound) => {
      const { error } = resolveGoalValue(data, bound);
      return error ? [error] : [];
    });
  });
}

type ReferencedEntityColumns =
  | { type: "card"; id: CardId; columns: Set<string> }
  | { type: "measure"; id: MeasureId; columns: Set<string> };

export function getReferencedEntitiesFromVizSettings(
  settings: VisualizationSettings,
): ReferencedEntity[] {
  const foreignColumnRefs = getGoalForeignColumnRefs(settings);

  const columnsByEntity = foreignColumnRefs.reduce((map, ref) => {
    const refKey = `${ref.type}:${ref.id}`;
    const entry = map.get(refKey) ?? {
      type: ref.type,
      id: ref.id,
      columns: new Set<string>(),
    };
    entry.columns.add(ref.column);
    map.set(refKey, entry);
    return map;
  }, new Map<string, ReferencedEntityColumns>());

  return Array.from(columnsByEntity.values(), ({ type, id, columns }) => ({
    type,
    id,
    columns: Array.from(columns),
  }));
}

function getGoalForeignColumnRefs(
  settings: VisualizationSettings,
): GoalForeignColumnRef[] {
  const segments: GoalSegment[] = settings["gauge.segments"] ?? [];
  return segments
    .flatMap((segment) => [segment.min, segment.max])
    .filter(isGoalForeignColumnRef);
}

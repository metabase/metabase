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
  /** The server's explanation, when it gave one. */
  message?: string;
};

export type ResolvedGoalValue = {
  value: number | null;
  error?: GoalRefError;
  /** The results predate this reference; the re-run it triggered will fill it in. */
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
  const result = data.referenced_entities?.[type]?.[id];

  // These results were produced before the entity was referenced, by the run
  // that the settings change is replacing.
  if (result == null) {
    return { value: null, isResolving: true };
  }

  if (result.status !== "completed" || result.data == null) {
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

/**
 * Bounds that will never resolve without a fix. Segments with these are dropped
 * by [[resolveGoalSegments]], which silently rescales the chart, so callers
 * render an error instead of a chart built on the surviving segments.
 */
export const getGoalSegmentErrors = (
  segments: GoalSegment[] | undefined,
  data: DatasetData,
): GoalRefError[] => {
  if (!Array.isArray(segments)) {
    return [];
  }

  return segments.flatMap((segment) =>
    [segment.min, segment.max].flatMap((bound) => {
      const { error } = resolveGoalValue(bound, data);
      return error ? [error] : [];
    }),
  );
};

/**
 * Viz settings whose values may reference another entity's column. The backend
 * derives the same references from a saved card's settings in
 * `metabase.visualization-settings.dynamic-goals`, which covers `graph.goal_value`,
 * `progress.goal` and `scalar.segments` too; those aren't pickable in the UI yet,
 * so nothing here needs to send them.
 */
const getGoalValues = (settings: VisualizationSettings): (GoalValue | null)[] =>
  (settings["gauge.segments"] ?? []).flatMap((segment) => [
    segment.min,
    segment.max,
  ]);

type ReferencedEntityColumns =
  | { type: "card"; id: CardId; columns: Set<string> }
  | { type: "measure"; id: MeasureId; columns: Set<string> };

/**
 * The entities whose values the server has to run alongside the main query for
 * these settings to render, deduped and grouped by entity.
 */
export const getReferencedEntitiesFromVizSettings = (
  settings: VisualizationSettings,
): ReferencedEntity[] => {
  const refs = getGoalValues(settings).filter(isGoalForeignColumnRef);

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

import { match } from "ts-pattern";
import { t } from "ttag";

import { color } from "metabase/ui/colors";
import type {
  Card,
  CardId,
  DatasetData,
  GoalForeignColumnRef,
  GoalForeignEntityRef,
  GoalSegment,
  GoalValue,
  MeasureId,
  ReferencedEntity,
  ReferencedEntityType,
  RowValue,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import {
  isGoalForeignColumnRef,
  isGoalSegment,
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
  isUnanswered?: boolean;
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
  ref: GoalForeignColumnRef,
): ResolvedGoalValue {
  const { type, id, column } = ref;
  const result = data.referenced_entities?.[type]?.[id];

  if (result == null) {
    return { value: null, isUnanswered: true };
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

function validGoalSegments(segments: unknown): GoalSegment[] {
  return Array.isArray(segments) ? segments.filter(isGoalSegment) : [];
}

export function resolveGoalSegments(
  data: DatasetData,
  segments: GoalSegment[] | undefined,
): ResolvedGoalSegment[] {
  return validGoalSegments(segments).flatMap((segment) => {
    const min = resolveGoalValue(data, segment.min).value;
    const max = resolveGoalValue(data, segment.max).value;

    if (min == null || max == null || !segmentIsValid({ min, max })) {
      return [];
    }

    return [
      { color: getSegmentColor(segment), label: segment.label, min, max },
    ];
  });
}

export function getSegmentColor(segment: GoalSegment): string {
  return segment.color ?? color("text-secondary");
}

export function getGoalSegmentErrors(
  data: DatasetData,
  segments: GoalSegment[] | undefined,
): GoalRefError[] {
  return validGoalSegments(segments).flatMap((segment) => {
    return [segment.min, segment.max].flatMap((bound) => {
      const { error } = resolveGoalValue(data, bound);
      return error ? [error] : [];
    });
  });
}

export function needsAnswer(resolved: ResolvedGoalValue): boolean {
  return (
    resolved.isUnanswered === true ||
    resolved.error?.reason === "column-not-found"
  );
}

export function getUnansweredGoalEntities(
  data: DatasetData,
  segments: GoalSegment[] | undefined,
): ReferencedEntity[] {
  const unansweredRefs = validGoalSegments(segments)
    .flatMap((segment) => [segment.min, segment.max])
    .filter(isGoalForeignColumnRef)
    .filter((ref) => needsAnswer(resolveGoalValue(data, ref)));
  const entities = new Map(
    unansweredRefs.map((ref) => [
      `${ref.type}:${ref.id}`,
      toReferencedEntity(ref),
    ]),
  );

  return Array.from(entities.values());
}

export function toReferencedEntity({
  type,
  id,
}: GoalForeignEntityRef): ReferencedEntity {
  return { type, id };
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
  return validGoalSegments(settings["gauge.segments"])
    .flatMap((segment) => [segment.min, segment.max])
    .filter(isGoalForeignColumnRef);
}

export function hasUnansweredGoalReferences(
  settings: VisualizationSettings,
  data: DatasetData | undefined,
): boolean {
  return getGoalForeignColumnRefs(settings).some(
    (ref) => data == null || resolveGoalValue(data, ref).isUnanswered === true,
  );
}

export function cardHasUnresolvedGoalReferences(
  card: Pick<Card, "display" | "visualization_settings">,
  data: DatasetData | undefined,
): boolean {
  if (!supportsDynamicGoals(card.display)) {
    return false;
  }

  return getGoalForeignColumnRefs(card.visualization_settings).some((ref) => {
    if (data == null) {
      return true;
    }

    const { error, isUnanswered } = resolveGoalValue(data, ref);
    return isUnanswered === true || error != null;
  });
}

export function supportsDynamicGoals(display: VisualizationDisplay): boolean {
  return match(display)
    .with("gauge", () => true)
    .otherwise(() => false);
}

import { match } from "ts-pattern";
import { t } from "ttag";

import { color } from "metabase/ui/colors";
import type { ColorGetter } from "metabase/ui/colors/types";
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
  isGoalValue,
} from "metabase-types/guards";

import { segmentIsValid } from "./utils";

export type GoalData = Pick<
  DatasetData,
  "cols" | "rows" | "referenced_entities"
>;

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
  data: GoalData,
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
  data: GoalData,
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
  data: GoalData,
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

export type GoalSettingKey =
  | "graph.goal_value"
  | "progress.goal"
  | "gauge.segments"
  | "scalar.segments";

type GoalSettingKind = "value" | "segments";

// Mirrors `goal-settings` in metabase.visualization-settings.dynamic-goals
const GOAL_SETTINGS: Record<GoalSettingKey, GoalSettingKind> = {
  "graph.goal_value": "value",
  "progress.goal": "value",
  "gauge.segments": "segments",
  "scalar.segments": "segments",
};

// A display is listed once its renderers, interactive and static, resolve the setting.
const DYNAMIC_GOAL_SETTINGS_BY_DISPLAY: Partial<
  Record<VisualizationDisplay, GoalSettingKey[]>
> = {
  gauge: ["gauge.segments"],
};

export function getDynamicGoalSettingKeys(
  display: VisualizationDisplay | undefined,
): GoalSettingKey[] {
  return display != null
    ? (DYNAMIC_GOAL_SETTINGS_BY_DISPLAY[display] ?? [])
    : [];
}

export function supportsDynamicGoals(
  display: VisualizationDisplay | undefined,
): boolean {
  return getDynamicGoalSettingKeys(display).length > 0;
}

export function isDynamicGoalSetting(
  display: VisualizationDisplay | undefined,
  key: GoalSettingKey,
): boolean {
  return getDynamicGoalSettingKeys(display).includes(key);
}

function validGoalSegments(segments: unknown): GoalSegment[] {
  return Array.isArray(segments) ? segments.filter(isGoalSegment) : [];
}

function getSegmentBounds(segments: GoalSegment[]): (GoalValue | null)[] {
  return segments.flatMap((segment) => [segment.min, segment.max]);
}

export function getGoalSegmentBounds(
  segments: GoalSegment[] | undefined,
): (GoalValue | null)[] {
  return getSegmentBounds(validGoalSegments(segments));
}

export function getGoalValuesFromVizSettings(
  settings: VisualizationSettings,
  keys: GoalSettingKey[],
): GoalValue[] {
  return keys.flatMap((key) => {
    const setting: unknown = settings[key];

    return match(GOAL_SETTINGS[key])
      .with("value", () => (isGoalValue(setting) ? [setting] : []))
      .with("segments", () =>
        getSegmentBounds(validGoalSegments(setting)).filter(isGoalValue),
      )
      .exhaustive();
  });
}

export function resolveGoalSegments(
  data: GoalData,
  segments: GoalSegment[] | undefined,
  getColor: ColorGetter = color,
): ResolvedGoalSegment[] {
  return validGoalSegments(segments).flatMap((segment) => {
    const min = resolveGoalValue(data, segment.min).value;
    const max = resolveGoalValue(data, segment.max).value;

    if (min == null || max == null || !segmentIsValid({ min, max })) {
      return [];
    }

    return [
      {
        color: getSegmentColor(segment, getColor),
        label: segment.label,
        min,
        max,
      },
    ];
  });
}

export function getSegmentColor(
  segment: GoalSegment,
  getColor: ColorGetter = color,
): string {
  return segment.color ?? getColor("text-secondary");
}

export type GoalValues = ReadonlyArray<GoalValue | null | undefined>;

export function hasFailedGoalReferencesForValues(
  data: GoalData,
  values: GoalValues,
): boolean {
  return values.some((value) => isFailed(value, resolveGoalValue(data, value)));
}

export function hasFailedGoalReferences(
  data: GoalData,
  segments: GoalSegment[] | undefined,
): boolean {
  return hasFailedGoalReferencesForValues(data, getGoalSegmentBounds(segments));
}

export function getUnansweredGoalEntitiesForValues(
  data: GoalData,
  values: GoalValues,
): ReferencedEntity[] {
  const unansweredRefs = values
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

export function getUnansweredGoalEntities(
  data: GoalData,
  segments: GoalSegment[] | undefined,
): ReferencedEntity[] {
  return getUnansweredGoalEntitiesForValues(
    data,
    getGoalSegmentBounds(segments),
  );
}

export function toReferencedEntity({
  type,
  id,
}: GoalForeignEntityRef): ReferencedEntity {
  return { type, id };
}

export type GoalCard = Pick<Card, "display" | "visualization_settings">;

export function getGoalForeignColumnRefs(
  card: GoalCard,
): GoalForeignColumnRef[] {
  return getGoalValuesFromVizSettings(
    card.visualization_settings,
    getDynamicGoalSettingKeys(card.display),
  ).filter(isGoalForeignColumnRef);
}

type ReferencedEntityColumns =
  | { type: "card"; id: CardId; columns: Set<string> }
  | { type: "measure"; id: MeasureId; columns: Set<string> };

// The entities a query for `card` must also answer, with the columns their goals read.
export function getReferencedEntities(card: GoalCard): ReferencedEntity[] {
  const columnsByEntity = getGoalForeignColumnRefs(card).reduce((map, ref) => {
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

function hasGoalReferencesWhere(
  card: GoalCard,
  data: GoalData | undefined,
  predicate: (resolved: ResolvedGoalValue) => boolean,
): boolean {
  return getGoalForeignColumnRefs(card).some(
    (ref) => data == null || predicate(resolveGoalValue(data, ref)),
  );
}

// Skips failed references so dashboards don't re-run a failing query on every render.
export function hasUnansweredGoalReferences(
  card: GoalCard,
  data: GoalData | undefined,
): boolean {
  return hasGoalReferencesWhere(card, data, isUnanswered);
}

// Includes failed references so a user action in the query builder retries them.
export function hasUnresolvedGoalReferences(
  card: GoalCard,
  data: GoalData | undefined,
): boolean {
  return hasGoalReferencesWhere(card, data, isUnresolved);
}

// Missing columns are worth re-running for - failed queries would just fail again.
export function needsAnswer(resolved: ResolvedGoalValue): boolean {
  return (
    isUnanswered(resolved) || resolved.error?.reason === "column-not-found"
  );
}

// The result has no answer for the referenced entity.
function isUnanswered(resolved: ResolvedGoalValue): boolean {
  return resolved.isUnanswered === true;
}

// Unanswered, or answered with an error.
function isUnresolved(resolved: ResolvedGoalValue): boolean {
  return isUnanswered(resolved) || resolved.error != null;
}

// Only a foreign reference gets re-asked (see needsAnswer) - every other error is final.
function isFailed(
  value: GoalValue | null | undefined,
  resolved: ResolvedGoalValue,
): boolean {
  return (
    resolved.error != null &&
    !(isGoalForeignColumnRef(value) && needsAnswer(resolved))
  );
}

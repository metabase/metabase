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

import {
  GOAL_SETTINGS,
  type GoalSettingKey,
  type GoalSettingKind,
  getDynamicGoalSettingKeys,
} from "./dynamic-goal-settings";

export type GoalData = Pick<
  DatasetData,
  "cols" | "rows" | "referenced_entities"
>;

// A bound left empty stays null; at most one bound is null.
export type ResolvedOpenEndedGoalSegment = {
  color: string;
  label?: string;
  min: number | null;
  max: number | null;
};

export type ResolvedGoalSegment = ResolvedOpenEndedGoalSegment & {
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

export type GoalValueResult = {
  value: number | null;
  error?: GoalRefError;
  isUnanswered?: boolean;
};

export type GoalCard = {
  display: Card["display"];
  visualization_settings?: Card["visualization_settings"];
};

export function resolveGoalValue(
  data: GoalData,
  goalValue: GoalValue | null | undefined,
): GoalValueResult {
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
): GoalValueResult {
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
): GoalValueResult {
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

export function getNumericGoalValue(
  settings: VisualizationSettings,
): number | null {
  const value = settings["graph.goal_value"];
  return isGoalStaticValue(value) ? value : null;
}

export function isDynamicGoalSetting(
  display: VisualizationDisplay | undefined,
  key: GoalSettingKey,
): boolean {
  return getDynamicGoalSettingKeys(display).includes(key);
}

export const getUnresolvedGoalMessage = (kind: GoalSettingKind) =>
  match(kind)
    .with(
      "value",
      () => t`Couldn't load the value this chart's goal depends on.`,
    )
    .with(
      "segments",
      () => t`Couldn't load a value one of this chart's ranges depends on.`,
    )
    .exhaustive();

function isGoalSettingActive(
  settings: VisualizationSettings,
  key: GoalSettingKey,
): boolean {
  return key !== "graph.goal_value" || settings["graph.show_goal"] === true;
}

export function needsGraphGoalResolution(
  display: VisualizationDisplay | undefined,
  settings: VisualizationSettings,
): boolean {
  const goal = settings["graph.goal_value"];

  return (
    isGoalSettingActive(settings, "graph.goal_value") &&
    goal != null &&
    !isGoalStaticValue(goal) &&
    isDynamicGoalSetting(display, "graph.goal_value")
  );
}

/**
 * Substitutes `graph.goal_value` with the number `data` resolves it to, or
 * null when it can't, so the chart model only ever sees numbers. Returns the
 * given settings untouched when there is nothing to resolve.
 */
export function resolveGraphGoalSettings<S extends VisualizationSettings>(
  display: VisualizationDisplay | undefined,
  settings: S,
  data: GoalData,
): S {
  if (!needsGraphGoalResolution(display, settings)) {
    return settings;
  }

  return {
    ...settings,
    "graph.goal_value": resolveGoalValue(data, settings["graph.goal_value"])
      .value,
  };
}

function validGoalSegments(segments: unknown): GoalSegment[] {
  return Array.isArray(segments) ? segments.filter(isGoalSegment) : [];
}

export function getGoalSegmentBounds(segments: unknown): (GoalValue | null)[] {
  return validGoalSegments(segments).flatMap((segment) => [
    segment.min,
    segment.max,
  ]);
}

export function getGoalValues(
  settings: VisualizationSettings,
  keys: GoalSettingKey[],
): GoalValue[] {
  return keys.flatMap((key) => {
    if (!isGoalSettingActive(settings, key)) {
      return [];
    }

    const setting: unknown = settings[key];

    return match(GOAL_SETTINGS[key])
      .with("value", () => (isGoalValue(setting) ? [setting] : []))
      .with("segments", () => getGoalSegmentBounds(setting).filter(isGoalValue))
      .exhaustive();
  });
}

export function resolveOpenEndedGoalSegments(
  data: GoalData,
  segments: GoalSegment[] | undefined,
  getColor: ColorGetter = color,
): ResolvedOpenEndedGoalSegment[] {
  return validGoalSegments(segments).flatMap((segment) => {
    const min = resolveGoalValue(data, segment.min).value;
    const max = resolveGoalValue(data, segment.max).value;
    // a set bound that failed to resolve must not pass as one left empty
    const hasUnresolvedBound =
      (segment.min != null && min == null) ||
      (segment.max != null && max == null);
    const hasBound = min != null || max != null;

    if (hasUnresolvedBound || !hasBound) {
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

export function resolveGoalSegments(
  data: GoalData,
  segments: GoalSegment[] | undefined,
  getColor: ColorGetter = color,
): ResolvedGoalSegment[] {
  return resolveOpenEndedGoalSegments(data, segments, getColor).filter(
    isClosedGoalSegment,
  );
}

function isClosedGoalSegment(
  segment: ResolvedOpenEndedGoalSegment,
): segment is ResolvedGoalSegment {
  return segment.min != null && segment.max != null;
}

export function getSegmentColor(
  segment: GoalSegment,
  getColor: ColorGetter = color,
): string {
  return segment.color ?? getColor("text-secondary");
}

export function hasFailedGoalValues(
  data: GoalData,
  values: (GoalValue | null | undefined)[],
): boolean {
  return values.some((value) => isFailed(value, resolveGoalValue(data, value)));
}

export function hasUnresolvedGoalValues(
  data: GoalData,
  values: (GoalValue | null | undefined)[],
): boolean {
  return values.some((value) => isUnresolved(resolveGoalValue(data, value)));
}

export function getUnansweredGoalEntities(
  data: GoalData,
  values: (GoalValue | null | undefined)[],
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

export function toReferencedEntity({
  type,
  id,
}: GoalForeignEntityRef): ReferencedEntity {
  return { type, id };
}

export function getGoalForeignColumnRefs(
  card: GoalCard,
): GoalForeignColumnRef[] {
  return getGoalValues(
    card.visualization_settings ?? {},
    getDynamicGoalSettingKeys(card.display),
  ).filter(isGoalForeignColumnRef);
}

type ReferencedEntityColumns =
  | { type: "card"; id: CardId; columns: Set<string> }
  | { type: "measure"; id: MeasureId; columns: Set<string> };

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
  predicate: (resolved: GoalValueResult) => boolean,
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
export function needsAnswer(resolved: GoalValueResult): boolean {
  return (
    isUnanswered(resolved) || resolved.error?.reason === "column-not-found"
  );
}

// The result has no answer for the referenced entity.
function isUnanswered(resolved: GoalValueResult): boolean {
  return resolved.isUnanswered === true;
}

// Unanswered, or answered with an error.
function isUnresolved(resolved: GoalValueResult): boolean {
  return isUnanswered(resolved) || resolved.error != null;
}

// Only a foreign reference gets re-asked (see needsAnswer) - every other error is final.
function isFailed(
  value: GoalValue | null | undefined,
  resolved: GoalValueResult,
): boolean {
  return (
    resolved.error != null &&
    !(isGoalForeignColumnRef(value) && needsAnswer(resolved))
  );
}

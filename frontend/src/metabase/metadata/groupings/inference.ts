import { msgid, ngettext, t } from "ttag";

import { isMilestoneField } from "metabase/metadata/lifecycle";
import type { SegmentGroup } from "metabase/metadata/segment-groups";
import type { PeriodGranularity } from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  isBoolean,
  isCategory,
  isDate,
  isDateWithoutTime,
  isFK,
  isNumeric,
  isPK,
  isPercentage,
  isScore,
} from "metabase-lib/v1/types/utils/isa";
import type { Field } from "metabase-types/api";

import { getTimeExtractLabel, getTimeUnitLabel } from "./labels";
import {
  type DefaultGroupingInference,
  type Grouping,
  type GroupingKind,
  TIME_EXTRACTS,
  TIME_UNITS,
  type TimeUnit,
} from "./types";

/** What sync reads besides the column itself */
export type GroupingInferenceContext = {
  /** The table's columns */
  fields: Field[];
  /** The table's process status column */
  statusField: Field | undefined;
  /** The table's segment groups */
  segmentGroups: SegmentGroup[];
  /** Set when the column is a periodic snapshot's period key: its rows' period */
  periodGranularity?: PeriodGranularity;
};

const isSameField = (a: Field, b: Field | undefined) =>
  b != null && getRawTableFieldId(a) === getRawTableFieldId(b);

/** Numbers that group into ranges: not keys, not codes */
export function isBinnableField(field: Field): boolean {
  return isNumeric(field) && !isPK(field) && !isFK(field) && !isCategory(field);
}

/** Which kind of grouping a column takes: by its type, never chosen */
export function getGroupingKind(field: Field): GroupingKind {
  if (isDate(field)) {
    return "time";
  }
  if (isBinnableField(field)) {
    return "bins";
  }
  return "partition";
}

const DATE_ONLY_SKIPPED_UNITS: TimeUnit[] = ["minute", "hour"];

/**
 * The implicit groupings every column of its type has: time units and parts
 * of dates, or equal ranges of numbers. Never stored.
 */
export function getBuiltInGroupings(field: Field): Grouping[] {
  if (isDate(field)) {
    const isDateOnly = isDateWithoutTime(field);
    const units = TIME_UNITS.filter(
      (unit) => !isDateOnly || !DATE_ONLY_SKIPPED_UNITS.includes(unit),
    );
    const extracts = TIME_EXTRACTS.filter(
      (extract) => !isDateOnly || extract !== "hour-of-day",
    );
    return [
      ...units.map(
        (unit): Grouping => ({
          name: getTimeUnitLabel(unit),
          source: "built-in",
          kind: "time",
          definition: { type: "unit", unit },
        }),
      ),
      ...extracts.map(
        (extract): Grouping => ({
          name: getTimeExtractLabel(extract),
          source: "built-in",
          kind: "time",
          definition: { type: "extract", extract },
        }),
      ),
    ];
  }
  if (isBinnableField(field)) {
    return [
      {
        name: t`Auto bins`,
        source: "built-in",
        kind: "bins",
        definition: { type: "auto" },
      },
      ...[10, 50, 100].map(
        (count): Grouping => ({
          name: t`${count} bins`,
          source: "built-in",
          kind: "bins",
          definition: { type: "count", count },
        }),
      ),
    ];
  }
  return [];
}

const nameOf = (field: Field) => field.name.toLowerCase();

const START_RE = /^(created_(at|on|date)|start(ed)?_at|opened_at)$/;
const DATE_SUFFIX_RE = /_(at|on|date|time)$/;
const SCORE_RE = /(score|rate|ratio|pct|percent|share)$/;
const AGE_RE = /(^|_)age$/;

const isStartField = (field: Field) =>
  field.semantic_type === "type/CreationTimestamp" ||
  START_RE.test(nameOf(field));

const isEndingMilestone = (field: Field) =>
  isMilestoneField(field) &&
  field.semantic_type !== "type/CancelationTimestamp" &&
  field.semantic_type !== "type/DeletionTimestamp";

const isScoreLike = (field: Field) =>
  isPercentage(field) || isScore(field) || SCORE_RE.test(nameOf(field));

const isAgeLike = (field: Field) => AGE_RE.test(nameOf(field));

/** "closed_at" → "closed" */
const getMilestoneWord = (field: Field) =>
  nameOf(field).replace(DATE_SUFFIX_RE, "").replace(/_/g, " ");

/**
 * Groupings sync proposes for a column, each with why. Names are stable, so
 * an admin's edits and removals of them stick.
 */
export function inferGroupings(
  field: Field,
  { fields, statusField, segmentGroups }: GroupingInferenceContext,
): Grouping[] {
  const groupings: Grouping[] = [];

  if (isDate(field)) {
    groupings.push({
      name: t`Age`,
      source: "sync",
      signal: t`${field.display_name} is a date, so rows have an age`,
      kind: "time",
      definition: { type: "elapsed", to: "now", unit: "day" },
    });
    if (isStartField(field)) {
      fields
        .filter(
          (other) => !isSameField(other, field) && isEndingMilestone(other),
        )
        .forEach((milestone) => {
          const word = getMilestoneWord(milestone);
          groupings.push({
            name: t`Time until ${word}`,
            source: "sync",
            signal: t`${field.display_name} starts a record and ${milestone.display_name} marks a milestone`,
            kind: "time",
            definition: {
              type: "elapsed",
              to: getRawTableFieldId(milestone),
              unit: "day",
            },
          });
        });
    }
  }

  if (isBinnableField(field)) {
    if (isScoreLike(field)) {
      groupings.push({
        name: t`Quartiles`,
        source: "sync",
        signal: t`${field.display_name} looks like a score or rate`,
        kind: "bins",
        definition: { type: "quantile", count: 4 },
      });
    } else if (isAgeLike(field)) {
      groupings.push({
        name: t`Age bands`,
        source: "sync",
        signal: t`${field.display_name} looks like a person's age`,
        kind: "bins",
        definition: {
          type: "edges",
          edges: [0, 18, 35, 55],
          labels: [t`Under 18`, t`18–34`, t`35–54`, t`55+`],
        },
      });
    }
  }

  if (isSameField(field, statusField)) {
    const fieldId = getRawTableFieldId(field);
    const signal = t`${field.display_name} is this table's status column`;
    groupings.push({
      // The full order is named after the column, like "Stage"
      name: field.display_name,
      source: "sync",
      signal,
      kind: "partition",
      definition: { type: "process", level: "order" },
    });
    const outcomeGroup = segmentGroups.find(
      (group) =>
        group.kind === "partition" &&
        group.source === "process" &&
        group.sourceFieldId === fieldId,
    );
    groupings.push({
      name: t`Outcome`,
      source: "sync",
      signal: outcomeGroup
        ? t`${field.display_name} is this table's status column, and its segment group ${outcomeGroup.name} splits it by outcome`
        : signal,
      kind: "partition",
      definition: outcomeGroup
        ? { type: "segment-group", segmentGroupId: outcomeGroup.id }
        : { type: "process", level: "buckets" },
    });
  } else if (isBoolean(field)) {
    groupings.push({
      name: t`Yes or no`,
      source: "sync",
      signal: t`${field.display_name} holds true and false`,
      kind: "partition",
      definition: {
        type: "value-map",
        groups: [
          { label: t`Yes`, values: ["true"] },
          { label: t`No`, values: ["false"] },
        ],
        other: false,
      },
    });
  }

  return groupings;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function getSpanSignal(spanMs: number): string {
  const days = Math.max(1, Math.round(spanMs / DAY_MS));
  if (days < 90) {
    return ngettext(
      msgid`Values span ${days} day`,
      `Values span ${days} days`,
      days,
    );
  }
  const months = Math.round(days / 30.4);
  if (months < 24) {
    return ngettext(
      msgid`Values span ${months} month`,
      `Values span ${months} months`,
      months,
    );
  }
  const years = Math.round(days / 365.25);
  return ngettext(
    msgid`Values span ${years} year`,
    `Values span ${years} years`,
    years,
  );
}

function getPeriodSignal(granularity: PeriodGranularity): string {
  switch (granularity) {
    case "minute":
      return t`Rows are one per minute`;
    case "hour":
      return t`Rows are one per hour`;
    case "day":
      return t`Rows are one per day`;
    case "week":
      return t`Rows are one per week`;
    case "month":
      return t`Rows are one per month`;
    case "quarter":
      return t`Rows are one per quarter`;
    case "year":
      return t`Rows are one per year`;
  }
}

function inferDefaultTimeUnit(
  field: Field,
  periodGranularity: PeriodGranularity | undefined,
): { unit: TimeUnit; signal: string } {
  const range = field.fingerprint?.type?.["type/DateTime"];
  const earliest = range ? Date.parse(range.earliest) : NaN;
  const latest = range ? Date.parse(range.latest) : NaN;
  const span = latest - earliest;
  let unit: TimeUnit = "month";
  let signal = t`No profiled date range; month suits most dates`;
  if (Number.isFinite(span)) {
    signal = getSpanSignal(span);
    if (span < 3 * DAY_MS) {
      unit = isDateWithoutTime(field) ? "day" : "hour";
    } else if (span < 90 * DAY_MS) {
      unit = "day";
    } else if (span < 548 * DAY_MS) {
      unit = "week";
    } else if (span < 6 * 365.25 * DAY_MS) {
      unit = "month";
    } else {
      unit = "quarter";
    }
  }
  // A snapshot's period key is never finer than its rows' period
  if (
    periodGranularity != null &&
    TIME_UNITS.indexOf(unit) < TIME_UNITS.indexOf(periodGranularity)
  ) {
    return {
      unit: periodGranularity,
      signal: getPeriodSignal(periodGranularity),
    };
  }
  return { unit, signal };
}

/**
 * The grouping sync picks as a column's default, among its groupings and
 * built-ins. `null` when there's nothing to pick.
 */
export function inferDefaultGrouping(
  field: Field,
  groupings: Grouping[],
  { statusField, periodGranularity }: GroupingInferenceContext,
): DefaultGroupingInference | null {
  const has = (name: string) => groupings.some((known) => known.name === name);

  if (isDate(field)) {
    const { unit, signal } = inferDefaultTimeUnit(field, periodGranularity);
    return { name: getTimeUnitLabel(unit), signal };
  }

  if (isSameField(field, statusField)) {
    if (has(t`Outcome`)) {
      return {
        name: t`Outcome`,
        signal: t`${field.display_name} is this table's status column`,
      };
    }
    const stage = field.display_name;
    return has(stage)
      ? {
          name: stage,
          signal: t`${field.display_name} is this table's status column`,
        }
      : null;
  }

  if (isBoolean(field)) {
    return has(t`Yes or no`)
      ? {
          name: t`Yes or no`,
          signal: t`${field.display_name} holds true and false`,
        }
      : null;
  }

  if (isBinnableField(field)) {
    if (isScoreLike(field) && has(t`Quartiles`)) {
      return {
        name: t`Quartiles`,
        signal: t`${field.display_name} looks like a score or rate`,
      };
    }
    if (isAgeLike(field) && has(t`Age bands`)) {
      return {
        name: t`Age bands`,
        signal: t`${field.display_name} looks like a person's age`,
      };
    }
    return {
      name: t`Auto bins`,
      signal: t`${field.display_name} is a number with no known scale`,
    };
  }

  return null;
}

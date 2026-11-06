import { msgid, ngettext, t } from "ttag";

import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { Field, FieldId, Measure, MeasureId } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import type { MeasureGroup } from "./measure-groups";

/** What a measure measures: the spec's measure_kind (project 14) */
export type MeasureKind =
  | "count"
  | "amount"
  | "ratio"
  | "distinct_count"
  | "balance"
  | "duration";

const MEASURE_KINDS: MeasureKind[] = [
  "count",
  "distinct_count",
  "amount",
  "balance",
  "ratio",
  "duration",
];

// A group of one measure organizes nothing
const MIN_PROPOSED_MEMBERS = 2;

// Aggregations whose operator alone says the kind
const KIND_BY_OPERATOR: Record<string, MeasureKind> = {
  count: "count",
  "cum-count": "count",
  "count-where": "count",
  distinct: "distinct_count",
  "distinct-where": "distinct_count",
  share: "ratio",
  "/": "ratio",
};
const BALANCE_NAME_RE = /(balance|outstanding|inventory|stock|_arr|_mrr)$/;
const DURATION_NAME_RE =
  /(duration|_seconds|_minutes|_hours|_days|time_to_|_time$)/;

/** The first aggregation clause of a measure's MBQL 5 definition */
function getAggregation(definition: unknown): unknown[] | null {
  if (!isObject(definition) || !Array.isArray(definition.stages)) {
    return null;
  }
  const [stage] = definition.stages;
  if (!isObject(stage) || !Array.isArray(stage.aggregation)) {
    return null;
  }
  const [aggregation] = stage.aggregation;
  return Array.isArray(aggregation) ? aggregation : null;
}

/** The first column an aggregation reads, at any depth */
function findFieldId(clause: unknown): FieldId | null {
  if (!Array.isArray(clause)) {
    return null;
  }
  const [operator, , id] = clause;
  if (operator === "field" && typeof id === "number") {
    return id;
  }
  for (const argument of clause) {
    const fieldId = findFieldId(argument);
    if (fieldId != null) {
      return fieldId;
    }
  }
  return null;
}

/**
 * PROTOTYPE: mocked. Project 14 owns measure_kind; until then, read it off
 * the aggregation and the name of the column it sums or averages.
 */
export function inferMeasureKind(
  measure: Pick<Measure, "definition">,
  fields: Field[],
): MeasureKind | null {
  const aggregation = getAggregation(measure.definition);
  const operator = aggregation?.[0];
  if (typeof operator !== "string") {
    return null;
  }
  if (Object.hasOwn(KIND_BY_OPERATOR, operator)) {
    return KIND_BY_OPERATOR[operator];
  }
  const fieldId = findFieldId(aggregation);
  const name =
    fields
      .find((field) => getRawTableFieldId(field) === fieldId)
      ?.name.toLowerCase() ?? "";
  if (DURATION_NAME_RE.test(name)) {
    return "duration";
  }
  if (BALANCE_NAME_RE.test(name)) {
    return "balance";
  }
  return "amount";
}

/** A measure kind's name as a group heading */
export function getMeasureKindGroupName(kind: MeasureKind): string {
  switch (kind) {
    case "count":
      return t`Counts`;
    case "distinct_count":
      return t`Distinct counts`;
    case "amount":
      return t`Amounts`;
    case "balance":
      return t`Balances`;
    case "ratio":
      return t`Ratios`;
    case "duration":
      return t`Durations`;
  }
}

/** A group sync suggests; accepting saves it as is */
export type MeasureGroupProposal = {
  /** Stable across syncs, so a dismissal sticks */
  key: string;
  name: string;
  measureIds: MeasureId[];
  signal: string;
};

/**
 * One group per measure kind with at least two measures that aren't in a
 * group yet. Idempotent on the group's name: an existing group by that name
 * stops the proposal.
 */
export function getMeasureGroupProposals(
  measures: Measure[],
  fields: Field[],
  groups: MeasureGroup[],
): MeasureGroupProposal[] {
  const grouped = new Set(groups.flatMap(({ measureIds }) => measureIds));
  const ungrouped = measures.filter(({ id }) => !grouped.has(id));
  return MEASURE_KINDS.flatMap((kind): MeasureGroupProposal[] => {
    const members = ungrouped.filter(
      (measure) => inferMeasureKind(measure, fields) === kind,
    );
    const name = getMeasureKindGroupName(kind);
    if (
      members.length < MIN_PROPOSED_MEMBERS ||
      groups.some((group) => group.name === name)
    ) {
      return [];
    }
    return [
      {
        key: `kind:${kind}`,
        name,
        measureIds: members.map(({ id }) => id),
        signal: ngettext(
          msgid`${members.length} measure of this kind`,
          `${members.length} measures of this kind`,
          members.length,
        ),
      },
    ];
  });
}

export function getMeasureGroupSourceLabel(
  source: MeasureGroup["source"],
): string | null {
  switch (source) {
    case "suggestion":
      return t`Suggested from what the measures measure`;
    case "pack":
      return t`From a domain pack`;
    case "admin":
      return null;
  }
}

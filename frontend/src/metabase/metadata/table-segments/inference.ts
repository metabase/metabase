import { t } from "ttag";

import {
  type OrderedValue,
  VALUE_BUCKETS,
  getValueBucketLabel,
  isMilestoneField,
} from "metabase/metadata/lifecycle";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { isBoolean, isDate } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, SegmentId, Table } from "metabase-types/api";

/** The segments sync builds from a table's row-lifecycle columns */
export type SystemSegmentRole =
  | "exclude_deleted"
  | "current_rows"
  | "exclude_test"
  /** The AND of the others; the table's default segment */
  | "default_scope";

/** One segment per lifecycle condition, in the order they're listed */
export const CONDITION_SEGMENT_ROLES: SystemSegmentRole[] = [
  "exclude_deleted",
  "current_rows",
  "exclude_test",
];

export const SYSTEM_SEGMENT_ROLES: SystemSegmentRole[] = [
  ...CONDITION_SEGMENT_ROLES,
  "default_scope",
];

export type Confidence = "high" | "low";

/**
 * One filter on one column, in a form any query on the table can turn into a
 * clause. Kept free of query objects so it can be inferred from fields alone.
 */
export type FieldCondition =
  | { fieldId: FieldId; operator: "="; value: boolean | string }
  /** Any of several values, like a status bucket's */
  | { fieldId: FieldId; operator: "in"; values: string[] }
  | { fieldId: FieldId; operator: "is-null" | "not-null" }
  | { fieldId: FieldId; operator: "last-days"; days: number }
  /** The latest complete period at the column's grain */
  | { fieldId: FieldId; operator: "last-period"; unit: PeriodUnit };

/** A period key's grain */
export type PeriodUnit =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

export type SystemSegmentInference = {
  conditions: FieldCondition[];
  signal: string;
  confidence: Confidence;
};

/** The segment a table's questions start from */
export type DefaultSegment =
  | { type: "all" }
  | { type: "system"; role: SystemSegmentRole }
  | { type: "custom"; segmentId: SegmentId };

export type DefaultSegmentInference = {
  segment: DefaultSegment;
  signal: string;
  confidence: Confidence;
};

export type RequiredFilterInference = {
  /** `null` when the table needs no required filter */
  condition: FieldCondition | null;
  signal: string;
  confidence: Confidence;
};

/** A comparison group sync proposes; an admin accepts or dismisses it */
export type CohortProposal = {
  /** Stable across syncs, so a dismissal sticks */
  key: string;
  /** A status column's bucket, or a milestone date that's set */
  kind: "status" | "milestone";
  name: string;
  condition: FieldCondition;
  signal: string;
};

export function getSystemSegmentLabel(role: SystemSegmentRole): string {
  switch (role) {
    case "exclude_deleted":
      return t`Not deleted`;
    case "current_rows":
      return t`Current records`;
    case "exclude_test":
      return t`No test data`;
    case "default_scope":
      return t`Default rows`;
  }
}

/** The segment's role in a word or two, for its badge */
export function getSystemSegmentRoleLabel(role: SystemSegmentRole): string {
  switch (role) {
    case "exclude_deleted":
      return t`Exclude deleted`;
    case "current_rows":
      return t`Current rows`;
    case "exclude_test":
      return t`Exclude test`;
    case "default_scope":
      return t`Default scope`;
  }
}

export function getSystemSegmentDescription(role: SystemSegmentRole): string {
  switch (role) {
    case "exclude_deleted":
      return t`Leaves out rows that were deleted at the source`;
    case "current_rows":
      return t`Keeps only the current version of each record`;
    case "exclude_test":
      return t`Leaves out test and sandbox rows`;
    case "default_scope":
      return t`All of this table's other system segments together. Its questions start from it.`;
  }
}

const nameOf = (field: Field) => field.name.toLowerCase();
const idOf = (field: Field) => getRawTableFieldId(field);

type LifecycleRule = {
  role: SystemSegmentRole;
  pattern: RegExp;
  isColumnType: (field: Field) => boolean;
  toCondition: (fieldId: FieldId) => FieldCondition;
  confidence: Confidence;
  describe: (field: Field) => string;
};

const isFalse = (fieldId: FieldId): FieldCondition => ({
  fieldId,
  operator: "=",
  value: false,
});
const isTrue = (fieldId: FieldId): FieldCondition => ({
  fieldId,
  operator: "=",
  value: true,
});
const isNull = (fieldId: FieldId): FieldCondition => ({
  fieldId,
  operator: "is-null",
});

// The lifecycle types from the spec, recognised by name: SoftDeleteFlag,
// DeletionTimestamp, CurrentRowFlag, ValidTo, and TestDataFlag
const LIFECYCLE_RULES: LifecycleRule[] = [
  {
    role: "exclude_deleted",
    pattern: /^(_fivetran_deleted|is_deleted|deleted|_deleted|is_archived)$/,
    isColumnType: isBoolean,
    toCondition: isFalse,
    confidence: "high",
    describe: (field) => t`${field.display_name} marks deleted rows`,
  },
  {
    role: "exclude_deleted",
    pattern: /^(deleted_at|deleted_on|deleted_date|archived_at)$/,
    isColumnType: isDate,
    toCondition: isNull,
    confidence: "high",
    describe: (field) => t`${field.display_name} is set on deleted rows`,
  },
  {
    role: "current_rows",
    pattern: /^(is_current|current_flag|is_latest|_fivetran_active)$/,
    isColumnType: isBoolean,
    toCondition: isTrue,
    confidence: "high",
    describe: (field) => t`${field.display_name} marks the current version`,
  },
  {
    // "Active" can mean a status rather than a version, so it's a weaker guess
    role: "current_rows",
    pattern: /^(is_active|active)$/,
    isColumnType: isBoolean,
    toCondition: isTrue,
    confidence: "low",
    describe: (field) => t`${field.display_name} may mark the current version`,
  },
  {
    role: "current_rows",
    pattern: /(^|_)(valid_to|effective_to|dbt_valid_to)$|^_fivetran_end$/,
    isColumnType: isDate,
    toCondition: isNull,
    confidence: "low",
    describe: (field) => t`${field.display_name} is empty on current versions`,
  },
  {
    role: "exclude_test",
    pattern: /^(is_test|test|test_mode|is_test_data|is_sandbox)$/,
    isColumnType: isBoolean,
    toCondition: isFalse,
    confidence: "high",
    describe: (field) => t`${field.display_name} marks test rows`,
  },
  {
    // Inverted sense: livemode is true on real rows
    role: "exclude_test",
    pattern: /^livemode$/,
    isColumnType: isBoolean,
    toCondition: isTrue,
    confidence: "high",
    describe: (field) => t`${field.display_name} is false on test rows`,
  },
];

/** The columns a history table's binding names for its current version */
export type CurrentVersionBinding = {
  currentFlagFieldId: FieldId | null;
  validToFieldId: FieldId | null;
};

function inferCurrentRowsFromHistory(
  fields: Field[],
  { currentFlagFieldId, validToFieldId }: CurrentVersionBinding,
): SystemSegmentInference {
  const findField = (fieldId: FieldId | null) =>
    fields.find((field) => idOf(field) === fieldId);
  const currentFlag = findField(currentFlagFieldId);
  if (currentFlag != null) {
    return {
      conditions: [isTrue(idOf(currentFlag))],
      signal: t`${currentFlag.display_name} marks the current version, as set in History`,
      confidence: "high",
    };
  }
  const validTo = findField(validToFieldId);
  if (validTo != null) {
    return {
      conditions: [isNull(idOf(validTo))],
      signal: t`${validTo.display_name} is empty on current versions, as set in History`,
      confidence: "high",
    };
  }
  return {
    conditions: [],
    signal: t`The current version is the latest row per key, which a segment can't express`,
    confidence: "high",
  };
}

/** Every lifecycle condition the table has, ANDed into one segment */
function inferDefaultScope(
  fields: Field[],
  history?: CurrentVersionBinding,
): SystemSegmentInference {
  const members = CONDITION_SEGMENT_ROLES.map((role) => ({
    role,
    inference: inferSystemSegment(fields, role, history),
  })).filter(({ inference }) => inference.conditions.length > 0);
  if (members.length === 0) {
    return {
      conditions: [],
      signal: t`No deleted, current-version, or test-data column`,
      confidence: "high",
    };
  }
  const memberLabels = members
    .map(({ role }) => getSystemSegmentLabel(role))
    .join(", ");
  return {
    conditions: members.flatMap(({ inference }) => inference.conditions),
    signal: t`Combines ${memberLabels}`,
    confidence: members.some(({ inference }) => inference.confidence === "low")
      ? "low"
      : "high",
  };
}

/**
 * A system segment's conditions from the table's lifecycle columns, ANDed.
 * On a history table, its binding decides the current rows instead.
 */
export function inferSystemSegment(
  fields: Field[],
  role: SystemSegmentRole,
  history?: CurrentVersionBinding,
): SystemSegmentInference {
  if (role === "default_scope") {
    return inferDefaultScope(fields, history);
  }
  if (role === "current_rows" && history != null) {
    return inferCurrentRowsFromHistory(fields, history);
  }
  const matches = LIFECYCLE_RULES.filter((rule) => rule.role === role).flatMap(
    (rule) =>
      fields
        .filter(
          (field) =>
            rule.isColumnType(field) && rule.pattern.test(nameOf(field)),
        )
        .map((field) => ({ rule, field })),
  );

  if (matches.length === 0) {
    return {
      conditions: [],
      signal: t`No matching column`,
      confidence: "high",
    };
  }
  return {
    conditions: matches.map(({ rule, field }) => rule.toCondition(idOf(field))),
    signal: matches.map(({ rule, field }) => rule.describe(field)).join(". "),
    confidence: matches.some(({ rule }) => rule.confidence === "low")
      ? "low"
      : "high",
  };
}

/**
 * Sync points the table's default at its default scope segment, the AND of
 * every lifecycle condition it found. A table with none starts from all rows.
 */
export function inferDefaultSegment(
  fields: Field[],
  history?: CurrentVersionBinding,
): DefaultSegmentInference {
  const scope = inferSystemSegment(fields, "default_scope", history);
  if (scope.conditions.length > 0) {
    return {
      segment: { type: "system", role: "default_scope" },
      signal: scope.signal,
      confidence: scope.confidence,
    };
  }
  return {
    segment: { type: "all" },
    signal:
      history != null
        ? inferSystemSegment(fields, "current_rows", history).signal
        : t`No deleted, current-version, or test-data column`,
    confidence: "high",
  };
}

/** The instance default; databases and schemas can override it */
export const DEFAULT_REQUIRED_FILTER_ROW_THRESHOLD = 100_000_000;

const REQUIRED_FILTER_DAYS = 30;

/** What the main date is, for the required filter's default range */
export type MainDateKind = "event" | "period";

export type RequiredFilterMainDate = {
  field: Field;
  /** `null` when it's neither an event time nor a snapshot period */
  kind: MainDateKind | null;
  /** A period key's grain, for its finest period */
  periodUnit: PeriodUnit;
};

/**
 * Tables over the row threshold whose main date is an event time or snapshot
 * period get a required filter on it: the last 30 days of an event time, or
 * the latest period of a period key
 */
export function inferRequiredFilter(
  table: Pick<Table, "estimated_row_count">,
  mainDate: RequiredFilterMainDate | undefined,
  rowThreshold: number,
): RequiredFilterInference {
  const rowCount = table.estimated_row_count;
  if (rowCount == null) {
    return {
      condition: null,
      signal: t`Row count isn't known yet`,
      confidence: "high",
    };
  }
  const rows = rowCount.toLocaleString();
  const threshold = rowThreshold.toLocaleString();
  if (rowCount <= rowThreshold) {
    return {
      condition: null,
      signal: t`${rows} rows isn't over the ${threshold}-row threshold`,
      confidence: "high",
    };
  }
  if (!mainDate) {
    return {
      condition: null,
      signal: t`${rows} rows is over the ${threshold}-row threshold, but there's no main date to filter on`,
      confidence: "low",
    };
  }
  const { field, kind, periodUnit } = mainDate;
  switch (kind) {
    case "event":
      return {
        condition: {
          fieldId: idOf(field),
          operator: "last-days",
          days: REQUIRED_FILTER_DAYS,
        },
        signal: t`${rows} rows is over the ${threshold}-row threshold, so questions start from the last ${REQUIRED_FILTER_DAYS} days of ${field.display_name}`,
        confidence: "low",
      };
    case "period":
      return {
        condition: {
          fieldId: idOf(field),
          operator: "last-period",
          unit: periodUnit,
        },
        signal: t`${rows} rows is over the ${threshold}-row threshold, so questions start from the latest ${periodUnit} of ${field.display_name}`,
        confidence: "low",
      };
    case null:
      return {
        condition: null,
        signal: t`${rows} rows is over the ${threshold}-row threshold, but ${field.display_name} isn't an event time or snapshot period`,
        confidence: "low",
      };
  }
}

const MILESTONE_DATE_SUFFIX_RE = /_(at|on|date|time)$/;

const humanize = (words: string) => {
  const text = words.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * PROTOTYPE: mocked. Cohorts from milestones: rows whose milestone date is
 * set (MilestoneTimestamp is not null). Proposed, never applied by default.
 */
export function getMilestoneCohortProposals(fields: Field[]): CohortProposal[] {
  return fields.filter(isMilestoneField).map((field) => ({
    key: `milestone:${idOf(field)}`,
    kind: "milestone",
    name: humanize(nameOf(field).replace(MILESTONE_DATE_SUFFIX_RE, "")),
    condition: { fieldId: idOf(field), operator: "not-null" },
    signal: t`${field.display_name} is a milestone date`,
  }));
}

/**
 * PROTOTYPE: mocked. Cohorts from a status column: one per bucket of its value
 * order (Open, Won, Lost, Cancelled), each the bucket's values. Values still in
 * Other make no cohort. Proposed, never applied by default.
 */
export function getStatusCohortProposals(
  table: Pick<Table, "display_name">,
  statusField: Field,
  orderedValues: OrderedValue[],
): CohortProposal[] {
  const rows = table.display_name.toLowerCase();
  return VALUE_BUCKETS.filter((bucket) => bucket !== "other").flatMap(
    (bucket): CohortProposal[] => {
      const values = orderedValues
        .filter((value) => value.bucket === bucket)
        .map(({ value }) => value);
      if (values.length === 0) {
        return [];
      }
      const bucketLabel = getValueBucketLabel(bucket);
      return [
        {
          key: `status:${idOf(statusField)}:${bucket}`,
          kind: "status",
          name: t`${bucketLabel} ${rows}`,
          condition: { fieldId: idOf(statusField), operator: "in", values },
          signal: t`${statusField.display_name} values in its ${bucketLabel} bucket`,
        },
      ];
    },
  );
}

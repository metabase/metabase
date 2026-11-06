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

/** The segments every table has, built from its row-lifecycle columns */
export type SystemSegmentRole =
  | "exclude_deleted"
  | "current_rows"
  | "exclude_test";

export const SYSTEM_SEGMENT_ROLES: SystemSegmentRole[] = [
  "exclude_deleted",
  "current_rows",
  "exclude_test",
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
  | { fieldId: FieldId; operator: "last-days"; days: number };

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
  /** A milestone date or flag, or one value of a status column */
  kind: "milestone" | "status";
  name: string;
  condition: FieldCondition;
  signal: string;
};

export function getSystemSegmentLabel(role: SystemSegmentRole): string {
  switch (role) {
    case "exclude_deleted":
      return t`Excluding deleted`;
    case "current_rows":
      return t`Current records only`;
    case "exclude_test":
      return t`Excluding test data`;
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

/**
 * A system segment's conditions from the table's lifecycle columns, ANDed.
 * On a history table, its binding decides the current rows instead.
 */
export function inferSystemSegment(
  fields: Field[],
  role: SystemSegmentRole,
  history?: CurrentVersionBinding,
): SystemSegmentInference {
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
 * Current versions first, since a history table's old versions would double
 * count; then deleted rows; then test data, a weaker guess as a default.
 */
export function inferDefaultSegment(
  fields: Field[],
  history?: CurrentVersionBinding,
): DefaultSegmentInference {
  const roles: SystemSegmentRole[] = [
    "current_rows",
    "exclude_deleted",
    "exclude_test",
  ];
  for (const role of roles) {
    const inference = inferSystemSegment(fields, role, history);
    if (inference.conditions.length > 0) {
      return {
        segment: { type: "system", role },
        signal: inference.signal,
        confidence: role === "exclude_test" ? "low" : inference.confidence,
      };
    }
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

/**
 * Tables at or over the row threshold get a required filter on their main
 * date: the last 30 days
 */
export function inferRequiredFilter(
  table: Pick<Table, "estimated_row_count">,
  mainDateField: Field | undefined,
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
  if (rowCount < rowThreshold) {
    return {
      condition: null,
      signal: t`${rows} rows is under the ${threshold}-row threshold`,
      confidence: "high",
    };
  }
  if (!mainDateField) {
    return {
      condition: null,
      signal: t`${rows} rows is over the ${threshold}-row threshold, but there's no main date to filter on`,
      confidence: "low",
    };
  }
  return {
    condition: {
      fieldId: idOf(mainDateField),
      operator: "last-days",
      days: REQUIRED_FILTER_DAYS,
    },
    signal: t`${rows} rows is over the ${threshold}-row threshold, so questions start from the last ${REQUIRED_FILTER_DAYS} days of ${mainDateField.display_name}`,
    confidence: "low",
  };
}

// Past-tense steps a milestone flag can name; milestone dates use the shared
// MilestoneTimestamp rule instead
const MILESTONE_FLAG_VERBS = [
  "canceled",
  "cancelled",
  "churned",
  "converted",
  "trial_converted",
  "completed",
  "shipped",
  "delivered",
  "paid",
  "closed",
  "won",
  "lost",
  "activated",
  "onboarded",
  "refunded",
  "approved",
  "rejected",
  "resolved",
  "signed_up",
  "subscribed",
  "verified",
  "confirmed",
];
const MILESTONE_FLAG_RE = new RegExp(
  `^(is_|has_)?(${MILESTONE_FLAG_VERBS.join("|")})$`,
);
const MILESTONE_DATE_SUFFIX_RE = /_(at|on|date|time)$/;

const humanize = (words: string) => {
  const text = words.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Cohorts from milestones: a milestone date that's set, or a milestone flag
 * that's true. Status cohorts come from the status column's buckets; see
 * `getStatusBucketCohortProposals`.
 */
export function getMilestoneCohortProposals(fields: Field[]): CohortProposal[] {
  return fields.flatMap((field): CohortProposal[] => {
    if (isMilestoneField(field)) {
      return [
        {
          key: `milestone:${idOf(field)}`,
          kind: "milestone",
          name: humanize(nameOf(field).replace(MILESTONE_DATE_SUFFIX_RE, "")),
          condition: { fieldId: idOf(field), operator: "not-null" },
          signal: t`${field.display_name} is a milestone date`,
        },
      ];
    }
    const flagMatch = isBoolean(field)
      ? MILESTONE_FLAG_RE.exec(nameOf(field))
      : null;
    if (flagMatch) {
      return [
        {
          key: `milestone:${idOf(field)}`,
          kind: "milestone",
          name: humanize(flagMatch[2]),
          condition: { fieldId: idOf(field), operator: "=", value: true },
          signal: t`${field.display_name} is a milestone flag`,
        },
      ];
    }
    return [];
  });
}

/**
 * One cohort per bucket of a status column's lifecycle order (Open, Won,
 * Lost, Cancelled), each covering all the values in that bucket. Values
 * still in Other aren't proposed.
 */
export function getStatusBucketCohortProposals(
  field: Field,
  orderedValues: OrderedValue[],
): CohortProposal[] {
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
          key: `bucket:${idOf(field)}:${bucket}`,
          kind: "status",
          name: t`${field.display_name}: ${bucketLabel}`,
          condition: { fieldId: idOf(field), operator: "in", values },
          signal: t`${bucketLabel} values of ${field.display_name}: ${values.join(", ")}`,
        },
      ];
    },
  );
}

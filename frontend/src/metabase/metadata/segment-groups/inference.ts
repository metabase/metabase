import { t } from "ttag";

import {
  type OrderedValue,
  VALUE_BUCKETS,
  getValueBucketLabel,
} from "metabase/metadata/lifecycle";
import {
  type FieldCondition,
  SYSTEM_SEGMENT_ROLES,
  getMilestoneCohortProposals,
  inferSystemSegment,
} from "metabase/metadata/table-segments";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { singularize } from "metabase/utils/formatting";
import {
  isBoolean,
  isCategory,
  isFK,
  isPK,
} from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, Table } from "metabase-types/api";

import type { SegmentGroupSource } from "./segment-groups";

// A kind column with more values than this is a filter, not a partition
const MAX_KIND_MEMBERS = 6;

export type SegmentGroupProposalMember = {
  label: string;
  /** The name of the segment accepting creates */
  segmentName: string;
  condition: FieldCondition;
};

/** A partition sync proposes; accepting creates its segments and the group */
export type SegmentGroupProposal = {
  /** Stable across syncs, so a dismissal sticks */
  key: string;
  name: string;
  source: Exclude<SegmentGroupSource, "admin">;
  sourceFieldId: FieldId;
  members: SegmentGroupProposalMember[];
  /** Rows in no member, like status values still in Other */
  other: boolean;
  signal: string;
};

const idOf = (field: Field) => getRawTableFieldId(field);

/**
 * The outcome partition of a table's process: one member per bucket of the
 * status column's order, in order (Open, Won, Lost, Cancelled). Values still
 * in Other become the group's Other.
 */
export function getProcessPartitionProposal(
  table: Pick<Table, "display_name">,
  statusField: Field,
  orderedValues: OrderedValue[],
): SegmentGroupProposal | null {
  const rows = table.display_name.toLowerCase();
  const members = VALUE_BUCKETS.filter((bucket) => bucket !== "other").flatMap(
    (bucket): SegmentGroupProposalMember[] => {
      const values = orderedValues
        .filter((value) => value.bucket === bucket)
        .map(({ value }) => value);
      if (values.length === 0) {
        return [];
      }
      const label = t`${getValueBucketLabel(bucket)} ${rows}`;
      return [
        {
          label,
          segmentName: label,
          condition: { fieldId: idOf(statusField), operator: "in", values },
        },
      ];
    },
  );
  // One bucket splits nothing
  if (members.length < 2) {
    return null;
  }
  return {
    key: `process:${idOf(statusField)}`,
    name: t`${singularize(table.display_name)} outcome`,
    source: "process",
    sourceFieldId: idOf(statusField),
    members,
    other: orderedValues.some(({ bucket }) => bucket === "other"),
    signal: t`The buckets of ${statusField.display_name}'s order`,
  };
}

/**
 * Columns that already mean something else to segments: the flags behind
 * system segments (deleted, current, test) and milestone flags, which are
 * cohorts of their own.
 */
function getReservedFieldIds(fields: Field[]): Set<FieldId> {
  return new Set([
    ...SYSTEM_SEGMENT_ROLES.flatMap((role) =>
      inferSystemSegment(fields, role).conditions.map(({ fieldId }) => fieldId),
    ),
    ...getMilestoneCohortProposals(fields).map(
      ({ condition }) => condition.fieldId,
    ),
  ]);
}

/** A yes/no partition from every flag that isn't a scope or milestone flag */
export function getFlagPartitionProposals(
  fields: Field[],
): SegmentGroupProposal[] {
  const reserved = getReservedFieldIds(fields);
  return fields
    .filter((field) => isBoolean(field) && !reserved.has(idOf(field)))
    .map((field) => ({
      key: `flag:${idOf(field)}`,
      name: field.display_name,
      source: "flag",
      sourceFieldId: idOf(field),
      members: [
        {
          label: t`Yes`,
          segmentName: t`${field.display_name}: Yes`,
          condition: { fieldId: idOf(field), operator: "=", value: true },
        },
        {
          label: t`No`,
          segmentName: t`${field.display_name}: No`,
          condition: { fieldId: idOf(field), operator: "=", value: false },
        },
      ],
      other: false,
      signal: t`${field.display_name} is a yes or no flag`,
    }));
}

/**
 * Kind columns with few values, worth a partition per value. Their values
 * come from the field values cache, so callers fetch them per column.
 */
export function getKindPartitionCandidates(
  fields: Field[],
  statusFieldId: FieldId | undefined,
): Field[] {
  const reserved = getReservedFieldIds(fields);
  return fields.filter((field) => {
    const distinctCount = field.fingerprint?.global?.["distinct-count"];
    return (
      isCategory(field) &&
      !isBoolean(field) &&
      !isPK(field) &&
      !isFK(field) &&
      idOf(field) !== statusFieldId &&
      !reserved.has(idOf(field)) &&
      distinctCount != null &&
      distinctCount >= 2 &&
      distinctCount <= MAX_KIND_MEMBERS
    );
  });
}

export function getKindPartitionProposal(
  field: Field,
  values: string[],
): SegmentGroupProposal | null {
  if (values.length < 2 || values.length > MAX_KIND_MEMBERS) {
    return null;
  }
  return {
    key: `kind:${idOf(field)}`,
    name: field.display_name,
    source: "kind",
    sourceFieldId: idOf(field),
    members: values.map((value) => ({
      label: value,
      segmentName: t`${field.display_name}: ${value}`,
      condition: { fieldId: idOf(field), operator: "=", value },
    })),
    other: false,
    signal: t`${field.display_name} has ${values.length} values`,
  };
}

export function getSegmentGroupKindLabel(
  kind: "partition" | "overlapping",
): string {
  return kind === "partition" ? t`Partition` : t`Overlapping`;
}

export function getSegmentGroupSourceLabel(
  source: SegmentGroupSource,
  sourceField: Pick<Field, "display_name"> | undefined,
): string | null {
  const name = sourceField?.display_name;
  switch (source) {
    case "process":
      return name ? t`From the order of ${name}` : t`From the process`;
    case "flag":
      return name ? t`From the ${name} flag` : null;
    // A group named after its column already says where it comes from
    case "kind":
    case "admin":
      return null;
  }
}

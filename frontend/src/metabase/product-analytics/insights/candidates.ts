import {
  isBoolean,
  isFK,
  isPK,
  isString,
} from "metabase-lib/v1/types/utils/isa";
import type { Field } from "metabase-types/api";

import type { AnalysisContext } from "../analyses/types";
import type { ColumnRoles } from "../columns";

import type { InsightAttribute } from "./types";

const MIN_DISTINCT_VALUES = 2;
/** Columns with more values rarely make groups big enough to report, and cost the most rows. */
const MAX_DISTINCT_VALUES = 200;
const MAX_ATTRIBUTES = 20;

/**
 * Not filtered on how often the column is empty: event data is sparse by
 * design, and the search's minimum group size handles columns too sparse to
 * matter, per person rather than per event.
 */
const isCandidateField = (field: Field): boolean => {
  const distinctCount = field.fingerprint?.global?.["distinct-count"];
  return (
    field.active &&
    field.visibility_type !== "sensitive" &&
    field.visibility_type !== "retired" &&
    (isString(field) || isBoolean(field)) &&
    !isPK(field) &&
    !isFK(field) &&
    distinctCount !== undefined &&
    distinctCount >= MIN_DISTINCT_VALUES &&
    distinctCount <= MAX_DISTINCT_VALUES
  );
};

type GetInsightAttributesArgs = {
  context: AnalysisContext;
  roles: ColumnRoles;
  /**
   * Event table columns the steps are defined by. Splitting on them would be
   * circular: a step defined by a column trivially predicts reaching it.
   */
  stepColumns: ReadonlySet<string>;
};

/**
 * The columns to look for insights in: low-cardinality string and boolean
 * columns from the event table and the users table, most interesting first.
 * Role columns and the columns the steps are defined by are left out.
 */
export const getInsightAttributes = ({
  context,
  roles,
  stepColumns,
}: GetInsightAttributesArgs): InsightAttribute[] => {
  const roleColumns = new Set(Object.values(roles));
  const eventFields = (context.table?.fields ?? [])
    .filter(isCandidateField)
    .filter(
      (field) => !roleColumns.has(field.name) && !stepColumns.has(field.name),
    )
    .map((field) => ({ field, from: "events" as const }));
  const usersFields = (context.usersTable?.table.fields ?? [])
    .filter(isCandidateField)
    .filter((field) => field.name !== context.usersTable?.link.primaryKey)
    .map((field) => ({ field, from: "users" as const }));

  const distinctCount = (field: Field) =>
    field.fingerprint?.global?.["distinct-count"] ?? MAX_DISTINCT_VALUES;
  return [...eventFields, ...usersFields]
    .sort(
      (a, b) =>
        (b.field.dimension_interestingness ?? 0) -
          (a.field.dimension_interestingness ?? 0) ||
        distinctCount(a.field) - distinctCount(b.field),
    )
    .slice(0, MAX_ATTRIBUTES)
    .map(({ field, from }, index) => ({
      id: `attr_${index + 1}`,
      column: field.name,
      from,
      displayName: field.display_name,
    }));
};

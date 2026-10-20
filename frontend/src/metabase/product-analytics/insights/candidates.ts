import {
  isBoolean,
  isFK,
  isPK,
  isString,
} from "metabase-lib/v1/types/utils/isa";
import type { Field } from "metabase-types/api";

import type { AnalysisContext } from "../analyses/types";
import { type ColumnRoles, IDENTIFIED_COLUMN } from "../columns";

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
 * columns from the event table, most interesting first. Role columns and the
 * columns the steps are defined by are left out. Whether the person was
 * identified comes first, so it wins ties with traits that are empty for the
 * same people.
 *
 * The users table is left out too: it holds each person's current traits, so
 * joined onto events it shows a later state (a plan bought at checkout) as
 * known before the person reached earlier steps. Person traits as of each
 * event belong on the event table.
 */
export const getInsightAttributes = ({
  context,
  roles,
  stepColumns,
}: GetInsightAttributesArgs): InsightAttribute[] => {
  const roleColumns = new Set(Object.values(roles));
  const distinctCount = (field: Field) =>
    field.fingerprint?.global?.["distinct-count"] ?? MAX_DISTINCT_VALUES;
  const isIdentified = (field: Field) => field.name === IDENTIFIED_COLUMN;
  return (context.table?.fields ?? [])
    .filter(isCandidateField)
    .filter(
      (field) => !roleColumns.has(field.name) && !stepColumns.has(field.name),
    )
    .sort(
      (a, b) =>
        Number(isIdentified(b)) - Number(isIdentified(a)) ||
        (b.dimension_interestingness ?? 0) -
          (a.dimension_interestingness ?? 0) ||
        distinctCount(a) - distinctCount(b),
    )
    .slice(0, MAX_ATTRIBUTES)
    .map((field, index) => ({
      id: `attr_${index + 1}`,
      column: field.name,
      from: "events",
      displayName: field.display_name,
      description: field.description ?? undefined,
      asOf: isIdentified(field) ? "true-by-step" : "first-seen",
    }));
};

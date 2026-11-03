import { t } from "ttag";

import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId } from "metabase-types/api";

export const HISTORY_SOURCES = [
  "dbt-snapshot",
  "fivetran-history",
  "hand-rolled",
] as const;

export type HistorySource = (typeof HISTORY_SOURCES)[number];

export const CURRENT_ROW_RULES = [
  "flag",
  "open-valid-to",
  "far-future-valid-to",
] as const;

export type CurrentRowRule = (typeof CURRENT_ROW_RULES)[number];

export type HistorySourceInference = {
  source: HistorySource;
  signal: string;
};

export const FAR_FUTURE_VALID_TO = "9999-12-31";

const DBT_COLUMN_RE = /^dbt_(scd_id|valid_from|valid_to|updated_at)$/;
const FIVETRAN_COLUMN_RE = /^_fivetran_(start|end|active)$/;
const VALID_FROM_RE = /(^|_)(valid_from|effective_from)$/;
const VALID_TO_RE = /(^|_)(valid_to|effective_to)$/;
const CURRENT_FLAG_RE =
  /^(is_current|current_flag|is_latest)$|^_fivetran_active$/;
const DBT_VERSION_KEY_RE = /^dbt_scd_id$/;
const FIVETRAN_START_RE = /^_fivetran_start$/;
const SURROGATE_KEY_RE = /_(sk|key)$/;
const ID_RE = /^id$/;
const ENTITY_ID_RE = /^(?!dbt_).+_id$/;

const nameOf = (field: Field) => field.name.toLowerCase();
const namesMatching = (fields: Field[], pattern: RegExp) =>
  fields.map(nameOf).filter((name) => pattern.test(name));
const findMatching = (fields: Field[], pattern: RegExp) =>
  fields.find((field) => pattern.test(nameOf(field)));
const idOf = (field: Field | undefined) =>
  field ? getRawTableFieldId(field) : null;

export function inferHistorySource(fields: Field[]): HistorySourceInference {
  const dbtColumns = namesMatching(fields, DBT_COLUMN_RE);
  if (dbtColumns.length > 0) {
    return {
      source: "dbt-snapshot",
      signal: t`Has ${dbtColumns.join(", ")}, which dbt snapshots add`,
    };
  }
  const fivetranColumns = namesMatching(fields, FIVETRAN_COLUMN_RE);
  if (fivetranColumns.length > 0) {
    return {
      source: "fivetran-history",
      signal: t`Has ${fivetranColumns.join(", ")}, which Fivetran history mode adds`,
    };
  }
  const rangeColumns = [
    ...namesMatching(fields, VALID_FROM_RE),
    ...namesMatching(fields, VALID_TO_RE),
  ];
  return {
    source: "hand-rolled",
    signal:
      rangeColumns.length > 0
        ? t`Has its own ${rangeColumns.join(" and ")} columns, and no dbt or Fivetran columns`
        : t`No dbt or Fivetran columns`,
  };
}

export function getHistorySourceLabel(source: HistorySource) {
  const labels: Record<HistorySource, string> = {
    "dbt-snapshot": t`dbt snapshot`,
    "fivetran-history": t`Fivetran history mode`,
    "hand-rolled": t`Hand-built history table`,
  };
  return labels[source];
}

export function inferVersionKeyFieldId(
  fields: Field[],
  durableKeyFieldId: FieldId | null,
): FieldId | null {
  const pks = fields.filter(isPK);
  return idOf(
    findMatching(fields, DBT_VERSION_KEY_RE) ??
      pks.find((field) => SURROGATE_KEY_RE.test(nameOf(field))) ??
      pks.find((field) => getRawTableFieldId(field) !== durableKeyFieldId) ??
      findMatching(fields, FIVETRAN_START_RE),
  );
}

export function inferDurableKeyFallbackFieldId(fields: Field[]) {
  return idOf(
    findMatching(fields, ID_RE) ?? findMatching(fields, ENTITY_ID_RE),
  );
}

export function inferCurrentRowRule(fields: Field[]): CurrentRowRule {
  if (findMatching(fields, CURRENT_FLAG_RE)) {
    return "flag";
  }
  return inferHistorySource(fields).source === "fivetran-history"
    ? "far-future-valid-to"
    : "open-valid-to";
}

export function getCurrentRowRuleOptions(): {
  value: CurrentRowRule;
  label: string;
}[] {
  return [
    { value: "flag", label: t`Its current flag is true` },
    { value: "open-valid-to", label: t`Valid to is empty` },
    {
      value: "far-future-valid-to",
      label: t`Valid to is ${FAR_FUTURE_VALID_TO} or empty`,
    },
  ];
}

export function isCurrentRowRule(value: unknown): value is CurrentRowRule {
  return CURRENT_ROW_RULES.some((rule) => rule === value);
}

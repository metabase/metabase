import { t } from "ttag";

import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { isDate, isPK } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId } from "metabase-types/api";

export const SCD_TYPES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

export type ScdType = (typeof SCD_TYPES)[number];

export const HISTORY_INFERENCE_RULES = [
  "fivetran-history-mode",
  "dbt-snapshot",
  "explicit-interval",
  "key-shape",
  "name",
] as const;

export type HistoryInferenceRule = (typeof HISTORY_INFERENCE_RULES)[number];

export type ScdTypeInference = {
  scdType: ScdType | null;
  rule: HistoryInferenceRule | null;
  signal: string;
  confidence: "high" | "low";
};

const FIVETRAN_START_RE = /^_fivetran_start$/;
const FIVETRAN_END_RE = /^_fivetran_end$/;
const DBT_VALID_FROM_RE = /^dbt_valid_from$/;
const DBT_VALID_TO_RE = /^dbt_valid_to$/;
const INTERVAL_FROM_RE = /(^|_)(valid_from|effective_from|effective_date)$/;
const INTERVAL_TO_RE = /(^|_)(valid_to|effective_to|end_date)$/;
const KEY_SHAPE_VERSION_RE = /(^|_)(updated_at|version|revision)$/;
const HISTORY_NAME_RE = /_(history|snapshots?|versions?)$/;
const VERSION_RE = /(^|_)(version|revision|etag)$/;
const ID_RE = /^id$/;
const ENTITY_ID_RE = /^(?!dbt_|_fivetran_).+_id$/;

const nameOf = (field: Field) => field.name.toLowerCase();
const findMatching = (fields: Field[], pattern: RegExp) =>
  fields.find((field) => pattern.test(nameOf(field)));
const idOf = (field: Field | undefined) =>
  field ? getRawTableFieldId(field) : null;

function inferred(
  rule: HistoryInferenceRule,
  scdType: ScdType,
  signal: string,
  confidence: ScdTypeInference["confidence"],
): ScdTypeInference {
  return { scdType, rule, signal, confidence };
}

function findIntervalPair(fields: Field[]) {
  const validFrom = findMatching(fields, INTERVAL_FROM_RE);
  const validTo = findMatching(fields, INTERVAL_TO_RE);
  return validFrom && validTo ? [validFrom, validTo] : null;
}

function findKeyShape(fields: Field[]) {
  const pks = fields.filter(isPK);
  const idKey = pks.find((field) => !isDate(field));
  const versionKey = pks.find(
    (field) => isDate(field) || KEY_SHAPE_VERSION_RE.test(nameOf(field)),
  );
  return pks.length === 2 && idKey && versionKey ? [idKey, versionKey] : null;
}

export function inferScdType({
  name,
  fields,
}: {
  name: string;
  fields: Field[];
}): ScdTypeInference {
  const fivetranStart = findMatching(fields, FIVETRAN_START_RE);
  const fivetranEnd = findMatching(fields, FIVETRAN_END_RE);
  if (fivetranStart && fivetranEnd) {
    return inferred(
      "fivetran-history-mode",
      2,
      t`${fivetranStart.name} / ${fivetranEnd.name} → Fivetran history mode`,
      "high",
    );
  }
  const dbtFrom = findMatching(fields, DBT_VALID_FROM_RE);
  const dbtTo = findMatching(fields, DBT_VALID_TO_RE);
  if (dbtFrom && dbtTo) {
    return inferred(
      "dbt-snapshot",
      2,
      t`${dbtFrom.name} / ${dbtTo.name} → dbt snapshot`,
      "high",
    );
  }
  const interval = findIntervalPair(fields);
  if (interval) {
    return inferred(
      "explicit-interval",
      2,
      t`${interval[0].name} / ${interval[1].name} pair`,
      "high",
    );
  }
  const keyShape = findKeyShape(fields);
  if (keyShape) {
    return inferred(
      "key-shape",
      2,
      t`Key is ${keyShape[0].name} + ${keyShape[1].name}, so each row is a version and the latest row per ${keyShape[0].name} is current`,
      "low",
    );
  }
  if (HISTORY_NAME_RE.test(name.toLowerCase())) {
    return inferred("name", 2, t`Named like a history table`, "low");
  }
  return {
    scdType: null,
    rule: null,
    signal: t`No history columns, key shape or name matched`,
    confidence: "low",
  };
}

export function inferDurableKeyFieldId(fields: Field[]): FieldId | null {
  const nonKeys = fields.filter((field) => !isPK(field));
  return idOf(
    findMatching(nonKeys, ID_RE) ??
      findMatching(nonKeys, ENTITY_ID_RE) ??
      fields.find(isPK),
  );
}

export function inferVersionFieldId(fields: Field[]): FieldId | null {
  return idOf(findMatching(fields, VERSION_RE));
}

export function isScdType(value: unknown): value is ScdType {
  return SCD_TYPES.some((type) => type === value);
}

export function getScdTypeLabel(scdType: ScdType) {
  const labels: Record<ScdType, string> = {
    0: t`Type 0 · Never changes`,
    1: t`Type 1 · Overwritten, no history`,
    2: t`Type 2 · One row per version`,
    3: t`Type 3 · Previous value in a column`,
    4: t`Type 4 · History in its own table`,
    5: t`Type 5 · Mini-dimension with a current key`,
    6: t`Type 6 · Type 2 with current-value columns`,
    7: t`Type 7 · Type 2 with a current key on facts`,
  };
  return labels[scdType];
}

export function getHistorySignalLabel(rule: HistoryInferenceRule | null) {
  const labels: Record<HistoryInferenceRule, string> = {
    "fivetran-history-mode": t`Fivetran history mode`,
    "dbt-snapshot": t`dbt snapshot`,
    "explicit-interval": t`Date range columns`,
    "key-shape": t`id + updated_at key`,
    name: t`Name only`,
  };
  return rule ? labels[rule] : t`Set by hand`;
}

export const HISTORY_KINDS = [
  "versions-with-dates",
  "latest-row-per-key",
  "not-history",
] as const;

export type HistoryKind = (typeof HISTORY_KINDS)[number];

export function getHistoryKind(
  scdType: ScdType | null,
  hasValidTo: boolean,
): HistoryKind {
  if (scdType === 0 || scdType === 1) {
    return "not-history";
  }
  return hasValidTo ? "versions-with-dates" : "latest-row-per-key";
}

export function getHistoryKindOptions(): {
  value: HistoryKind;
  label: string;
  description: string;
}[] {
  return [
    {
      value: "versions-with-dates",
      label: t`One row per version, with dates`,
      description: t`Each row says when it started and ended being true.`,
    },
    {
      value: "latest-row-per-key",
      label: t`Latest row per key, older rows kept`,
      description: t`No end date. The newest row for each key is the current one.`,
    },
    {
      value: "not-history",
      label: t`Not a history table`,
      description: t`Every row counts as its own record.`,
    },
  ];
}

export function filtersCurrentRows(scdType: ScdType | null) {
  return scdType === 2 || scdType === 4 || scdType === 6 || scdType === 7;
}

export function countsDurableKeys(scdType: ScdType | null) {
  return scdType === 2 || scdType === 6 || scdType === 7;
}

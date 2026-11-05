import { t } from "ttag";

import type { CheckTableRef, GeneratedCheck } from "./types";

export type HistoryChecksInput = {
  table: CheckTableRef;
  columns: {
    entityKey: string;
    validFrom: string;
    validTo: string | null;
    currentFlag: string | null;
    version: string | null;
  };
  isContiguous: boolean;
};

export const HISTORY_CHECK_ID = {
  keyNotNull: "history:key-not-null",
  oneCurrent: "history:one-current",
  ranges: "history:ranges",
  validRange: "history:valid-range",
  currentIsOpen: "history:current-is-open",
  versionOrder: "history:version-order",
  oneVersionPerTime: "history:one-version-per-time",
} as const;

export function getHistoryCurrentCondition({
  validTo,
  currentFlag,
}: Pick<HistoryChecksInput["columns"], "validTo" | "currentFlag">) {
  if (currentFlag != null) {
    return `${currentFlag} = TRUE`;
  }
  return validTo != null ? `${validTo} IS NULL` : null;
}

function getKeyNotNullCheck({
  table,
  columns,
}: HistoryChecksInput): GeneratedCheck {
  return {
    id: HISTORY_CHECK_ID.keyNotNull,
    check: "not_null",
    table,
    params: { column: columns.entityKey },
    name: t`Every version has a ${columns.entityKey}`,
    severity: "error",
    basis: t`Entity key`,
  };
}

function getOneCurrentCheck(input: HistoryChecksInput): GeneratedCheck | null {
  const { table, columns } = input;
  const currentCondition = getHistoryCurrentCondition(columns);
  if (currentCondition == null) {
    return null;
  }
  return {
    id: HISTORY_CHECK_ID.oneCurrent,
    check: "unique",
    table,
    params: { column: columns.entityKey },
    where: currentCondition,
    name: t`One current version per ${columns.entityKey}`,
    severity: "error",
    basis: t`Current version rule`,
  };
}

function getRangesCheck({
  table,
  columns,
  isContiguous,
}: HistoryChecksInput): GeneratedCheck | null {
  if (columns.validTo == null) {
    return null;
  }
  return {
    id: HISTORY_CHECK_ID.ranges,
    check: "mutually_exclusive_ranges",
    table,
    params: {
      lower: columns.validFrom,
      upper: columns.validTo,
      partition_by: [columns.entityKey],
      gaps: isContiguous ? "not_allowed" : "allowed",
    },
    name: isContiguous
      ? t`Versions of a ${columns.entityKey} don't overlap or leave gaps`
      : t`Versions of a ${columns.entityKey} don't overlap`,
    severity: "error",
    basis: isContiguous
      ? t`Valid from and valid to, with no gaps between versions`
      : t`Valid from and valid to`,
  };
}

function getValidRangeCheck({
  table,
  columns,
}: HistoryChecksInput): GeneratedCheck | null {
  if (columns.validTo == null) {
    return null;
  }
  return {
    id: HISTORY_CHECK_ID.validRange,
    check: "column_a_lte_column_b",
    table,
    params: {
      a: columns.validFrom,
      b: columns.validTo,
      operator: "<",
      or_null: true,
    },
    name: t`${columns.validFrom} is before ${columns.validTo}`,
    severity: "error",
    basis: t`Valid from and valid to`,
  };
}

function getCurrentIsOpenCheck({
  table,
  columns,
}: HistoryChecksInput): GeneratedCheck | null {
  const { currentFlag, validTo } = columns;
  if (currentFlag == null || validTo == null) {
    return null;
  }
  return {
    id: HISTORY_CHECK_ID.currentIsOpen,
    check: "expression_is_true",
    table,
    params: {
      expression: `(${currentFlag} = TRUE) = (${validTo} IS NULL)`,
    },
    name: t`Only current versions have an open ${validTo}`,
    severity: "error",
    basis: t`Current flag and valid to`,
  };
}

function getVersionOrderCheck({
  table,
  columns,
}: HistoryChecksInput): GeneratedCheck | null {
  if (columns.version == null || columns.version === columns.validFrom) {
    return null;
  }
  return {
    id: HISTORY_CHECK_ID.versionOrder,
    check: "monotonic",
    table,
    params: {
      column: columns.version,
      order_by: columns.validFrom,
      direction: "increasing",
      strictly: true,
      partition_by: [columns.entityKey],
    },
    name: t`${columns.version} goes up with each version`,
    severity: "warn",
    basis: t`Version`,
  };
}

function getOneVersionPerTimeCheck({
  table,
  columns,
}: HistoryChecksInput): GeneratedCheck | null {
  if (columns.validTo != null) {
    return null;
  }
  return {
    id: HISTORY_CHECK_ID.oneVersionPerTime,
    check: "unique_combination",
    table,
    params: { columns: [columns.entityKey, columns.validFrom] },
    name: t`One version per ${columns.entityKey} and ${columns.validFrom}`,
    severity: "warn",
    basis: t`Entity key and valid from`,
  };
}

export function getHistoryChecks(input: HistoryChecksInput): GeneratedCheck[] {
  const checks = [
    getKeyNotNullCheck(input),
    getOneCurrentCheck(input),
    getRangesCheck(input),
    getValidRangeCheck(input),
    getCurrentIsOpenCheck(input),
    getVersionOrderCheck(input),
    getOneVersionPerTimeCheck(input),
  ];
  return checks.filter((check): check is GeneratedCheck => check != null);
}

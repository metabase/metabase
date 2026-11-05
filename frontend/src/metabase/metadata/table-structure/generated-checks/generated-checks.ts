import { isRoleA } from "../roles";
import type { TableStructure } from "../table-structure";

import {
  type CustomPropertyChecksInput,
  getCustomPropertyChecks,
} from "./custom-property-checks";
import { type HistoryChecksInput, getHistoryChecks } from "./history-checks";
import type { CheckResults, GeneratedCheck } from "./types";

export type GeneratedChecksInput = {
  structure: Pick<TableStructure, "role">;
  customProperties?: CustomPropertyChecksInput | null;
  history?: HistoryChecksInput | null;
};

export function getGeneratedChecks({
  structure,
  customProperties,
  history,
}: GeneratedChecksInput): GeneratedCheck[] {
  const { role } = structure;
  const isCustomPropertyTable =
    role != null && isRoleA(role, "role/CustomPropertyTable");
  const isHistoryTable = role != null && isRoleA(role, "role/HistoryDimension");
  return [
    ...(isCustomPropertyTable && customProperties != null
      ? getCustomPropertyChecks(customProperties)
      : []),
    ...(isHistoryTable && history != null ? getHistoryChecks(history) : []),
  ];
}

export function countFailingChecks(
  checks: readonly GeneratedCheck[],
  results: CheckResults,
) {
  return checks.filter(({ id }) => results.get(id)?.status === "failing")
    .length;
}

export function getWorstFailingCheck(
  checks: readonly GeneratedCheck[],
  results: CheckResults,
) {
  const failing = checks.filter(
    ({ id }) => results.get(id)?.status === "failing",
  );
  return (
    failing.find(({ severity }) => severity === "error") ?? failing[0] ?? null
  );
}

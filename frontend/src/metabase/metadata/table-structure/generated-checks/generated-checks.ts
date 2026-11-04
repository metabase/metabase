import { isRoleA } from "../roles";
import type { TableStructure } from "../table-structure";

import {
  type CustomPropertyChecksInput,
  getCustomPropertyChecks,
} from "./custom-property-checks";
import type { CheckResults, GeneratedCheck } from "./types";

export type GeneratedChecksInput = {
  structure: Pick<TableStructure, "role">;
  customProperties?: CustomPropertyChecksInput | null;
};

export function getGeneratedChecks({
  structure,
  customProperties,
}: GeneratedChecksInput): GeneratedCheck[] {
  const { role } = structure;
  const isCustomPropertyTable =
    role != null && isRoleA(role, "role/CustomPropertyTable");
  return [
    ...(isCustomPropertyTable && customProperties != null
      ? getCustomPropertyChecks(customProperties)
      : []),
  ];
}

export function countFailingChecks(
  checks: readonly GeneratedCheck[],
  results: CheckResults,
) {
  return checks.filter(({ id }) => results.get(id)?.status === "failing")
    .length;
}

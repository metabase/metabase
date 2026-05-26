import * as Lib from "metabase-lib";
import { isSummable } from "metabase-lib/v1/types/utils/isa";
import type { Card } from "metabase-types/api";

export type ValidationResult = {
  isValid: boolean;
  errorMessage?: string;
};

export function getValidationResult(query: Lib.Query): ValidationResult {
  return { isValid: Lib.canSave(query, "metric") };
}

export function isNumericMetric(card: Card): boolean {
  return card.result_metadata?.some(isSummable) ?? false;
}

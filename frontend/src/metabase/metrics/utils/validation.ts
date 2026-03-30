import * as Lib from "metabase-lib";

export type ValidationResult = {
  isValid: boolean;
  errorMessage?: string;
};

export function getValidationResult(query: Lib.Query): ValidationResult {
  return { isValid: Lib.canSave(query, "metric") };
}

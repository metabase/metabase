import { t } from "ttag";

import type { PythonTransformSourceDraft } from "metabase-types/api";

import type { ValidationResult } from "./types";

export function getValidationResult(
  source: PythonTransformSourceDraft,
): ValidationResult {
  if (!source["source-database"]) {
    return { isValid: false, errorMessage: t`Select a source a database` };
  }

  if (source.body.trim() === "") {
    return {
      isValid: false,
      errorMessage: t`The Python script cannot be empty`,
    };
  }

  if (Object.keys(source["source-tables"]).length === 0) {
    return {
      isValid: false,
      errorMessage: t`Select at least one table to alias`,
    };
  }

  return { isValid: true };
}

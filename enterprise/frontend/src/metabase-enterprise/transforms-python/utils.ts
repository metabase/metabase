import { t } from "ttag";

import type { PythonTransformSourceValidationResult } from "metabase/plugins";
import type {
  PythonTransformSource,
  PythonTransformSourceDraft,
} from "metabase-types/api";

export function getPythonSourceValidationResult(
  source: PythonTransformSourceDraft,
): PythonTransformSourceValidationResult {
  if (!source["source-database"]) {
    return { isValid: false, errorMessage: t`Select a source a database` };
  }

  if (source.body.trim() === "") {
    return {
      isValid: false,
      errorMessage: t`The Python script cannot be empty`,
    };
  }

  // Zero source tables is valid: ingestion-style transforms fetch their data
  // from external sources instead of reading Metabase tables.
  return { isValid: true };
}

export function isPythonTransformSource(
  source: PythonTransformSourceDraft,
): source is PythonTransformSource {
  return source.type === "python" && source["source-database"] !== undefined;
}

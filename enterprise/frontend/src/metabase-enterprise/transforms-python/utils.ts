import { t } from "ttag";

import type { PythonTransformSourceValidationResult } from "metabase/plugins";
import type { PythonTransformSourceDraft } from "metabase-types/api";

export function getPythonSourceValidationResult(
  source: PythonTransformSourceDraft,
): PythonTransformSourceValidationResult {
  if (source.body.trim() === "") {
    return {
      isValid: false,
      errorMessage: t`The transform cannot be empty`,
    };
  }

  if (Object.keys(source["source-tables"]).length === 0) {
    return {
      isValid: false,
      errorMessage: t`Select at least one table`,
    };
  }

  return { isValid: true };
}

import * as Lib from "metabase-lib";

import type { ValidationResult } from "./EditorHeader/types";

export function getValidationResult(query: Lib.Query): ValidationResult {
  return { isValid: Lib.canSave(query, "model") };
}

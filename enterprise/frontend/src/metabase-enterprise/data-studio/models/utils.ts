import { t } from "ttag";

import * as Lib from "metabase-lib";
import type { Field } from "metabase-types/api";

import type { ValidationResult } from "./types";

export function getValidationResult(
  query: Lib.Query,
  resultMetadata: Field[] | null,
): ValidationResult {
  const { isNative } = Lib.queryDisplayInfo(query);
  if (isNative) {
    const tags = Object.values(Lib.templateTags(query));
    if (tags.some((t) => t.type !== "card" && t.type !== "snippet")) {
      return {
        isValid: false,
        errorMessage: t`In models, you can use snippets and question or model references, but not variables.`,
      };
    }

    if (resultMetadata == null) {
      return {
        isValid: false,
        errorMessage: t`You must run the query before you can save this model.`,
      };
    }
  }

  return { isValid: Lib.canSave(query, "model") };
}

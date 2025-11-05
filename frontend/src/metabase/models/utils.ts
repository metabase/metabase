import { t } from "ttag";

import * as Lib from "metabase-lib";

export type ValidationResult = {
  isValid: boolean;
  errorMessage?: string;
};

export function getValidationResult(query: Lib.Query): ValidationResult {
  const { isNative } = Lib.queryDisplayInfo(query);
  if (isNative) {
    const tags = Object.values(Lib.templateTags(query));
    if (tags.some((t) => t.type !== "card" && t.type !== "snippet")) {
      return {
        isValid: false,
        errorMessage: t`In models, you can use snippets and question or model references, but not variables.`,
      };
    }
  }

  return { isValid: Lib.canSave(query, "model") };
}

import { t } from "ttag";

import type { PaneHeaderValidationResult } from "metabase/data-studio/components/PaneHeader/types";
import type { QueryEditorUiOptions } from "metabase/querying/editor/types";
import * as Lib from "metabase-lib";

export function getValidationResult(
  query: Lib.Query,
): PaneHeaderValidationResult {
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

export function getEditorOptions(): QueryEditorUiOptions {
  return {
    cardType: "model",
    convertToNativeTitle: t`SQL for this model`,
    convertToNativeButtonLabel: t`Convert this model to SQL`,
  };
}

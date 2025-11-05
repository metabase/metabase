import { t } from "ttag";

import type { QueryEditorUiOptions } from "metabase/querying/editor/types";

export function getEditorOptions(): QueryEditorUiOptions {
  return {
    cardType: "model",
    canConvertToNative: true,
    convertToNativeTitle: t`SQL for this model`,
    convertToNativeButtonLabel: t`Convert this model to SQL`,
  };
}

import { t } from "ttag";

import type { QueryEditorUiOptions } from "metabase/querying/editor/types";

export function getEditorOptions(readOnly: boolean): QueryEditorUiOptions {
  return {
    cardType: "model",
    readOnly,
    canConvertToNative: true,
    convertToNativeTitle: t`SQL for this model`,
    convertToNativeButtonLabel: t`Convert this model to SQL`,
  };
}

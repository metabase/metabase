import type { PaneHeaderValidationResult } from "metabase/data-studio/components/PaneHeader/types";
import type { QueryEditorUiOptions } from "metabase/querying/editor/types";
import * as Lib from "metabase-lib";

export function getValidationResult(
  query: Lib.Query,
): PaneHeaderValidationResult {
  return { isValid: Lib.canSave(query, "metric") };
}

export function getEditorOptions(query: Lib.Query): QueryEditorUiOptions {
  const { display, settings } = Lib.defaultDisplay(query);

  return {
    cardType: "metric",
    cardDisplay: display,
    cardVizSettings: settings,
    canConvertToNative: false,
  };
}

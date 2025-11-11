import type { QueryEditorUiOptions } from "metabase/querying/editor/types";
import * as Lib from "metabase-lib";

export function getEditorOptions(
  query: Lib.Query,
  readOnly: boolean,
): QueryEditorUiOptions {
  const { display, settings } = Lib.defaultDisplay(query);

  return {
    cardType: "metric",
    cardDisplay: display,
    cardVizSettings: settings,
    readOnly,
    canConvertToNative: false,
  };
}

import * as Lib from "metabase-lib";
import type { QueryEditorUiOptions } from "metabase/querying/editor/types";

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

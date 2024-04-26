import { trackSchemaEvent } from "metabase/lib/analytics";
import * as Lib from "metabase-lib";

export const trackColumnCombineViaShortcut = (query: Lib.Query) => {
  trackSchemaEvent("question", "1-0-4", {
    event: "column_combine_via_shortcut",
    custom_expressions_used: ["concat"],
    database_id: Lib.databaseID(query),
  });
};

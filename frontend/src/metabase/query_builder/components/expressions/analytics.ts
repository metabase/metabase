import { trackSchemaEvent } from "metabase/lib/analytics";

export const trackColumnCombineViaShortcut = () => {
  trackSchemaEvent("question", "1-0-4", {
    event: "column_combine_via_shortcut",
    custom_expressions_used: ["concat"],
  });
};

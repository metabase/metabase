import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackMetadataChange = (
  detail:
    | "type_casting"
    | "semantic_type_change"
    | "visibility_change"
    | "filtering_change"
    | "display_values"
    | "json_unfolding"
    | "formatting",
) => {
  trackSimpleEvent({
    event: "metadata_edited",
    event_detail: detail,
    triggered_from: "admin",
  });
};

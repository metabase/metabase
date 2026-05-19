import { trackSimpleEvent } from "metabase/analytics";

export type MetadataEditEventDetail =
  | "type_casting"
  | "semantic_type_change"
  | "visibility_change"
  | "filtering_change"
  | "display_values"
  | "json_unfolding"
  | "formatting";

export const trackMetadataChange = (detail: MetadataEditEventDetail) => {
  trackSimpleEvent({
    event: "metadata_edited",
    event_detail: detail,
    triggered_from: "admin",
  });
};

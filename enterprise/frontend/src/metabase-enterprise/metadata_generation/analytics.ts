import { trackSimpleEvent } from "metabase/analytics";
import type { MetadataEditEventDetail } from "metabase/metadata/pages/shared/analytics";

/** A field edit made from the review modal's field details pane, tracked like the data studio's own edits. */
export function trackMetadataChange(detail: MetadataEditEventDetail) {
  trackSimpleEvent({
    event: "metadata_edited",
    event_detail: detail,
    triggered_from: "data_studio",
  });
}

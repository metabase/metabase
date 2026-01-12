import { trackSimpleEvent } from "metabase/lib/analytics";
import type { MetadataEditEventDetail } from "metabase-types/analytics";

export function trackMetadataChange(detail: MetadataEditEventDetail) {
  trackSimpleEvent({
    event: "metadata_edited",
    event_detail: detail,
    triggered_from: "data_studio",
  });
}

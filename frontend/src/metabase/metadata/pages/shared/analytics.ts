import { trackSimpleEvent } from "metabase/lib/analytics";

import type { MetadataEditAnalyticsDetail } from "../DataModelV1/types";

export const trackMetadataChange = (detail: MetadataEditAnalyticsDetail) => {
  trackSimpleEvent({
    event: "metadata_edited",
    event_detail: detail,
    triggered_from: "admin",
  });
};

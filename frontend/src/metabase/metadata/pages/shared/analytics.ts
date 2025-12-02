import { trackSimpleEvent } from "metabase/lib/analytics";

import type {
  MetadataEditAnalyticsDetail,
  MetadataEventSource,
} from "../DataModelV1/types";

export const trackMetadataChange = (
  detail: MetadataEditAnalyticsDetail,
  triggered_from: MetadataEventSource,
) => {
  trackSimpleEvent({
    event: "metadata_edited",
    event_detail: detail,
    triggered_from,
  });
};

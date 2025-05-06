import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackNewCollectionInitiated = () =>
  trackSimpleEvent({
    event: "plus_button_clicked",
    triggered_from: "collection",
  });

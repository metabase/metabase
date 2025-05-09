import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackNewCollectionFromHeaderInitiated = () =>
  trackSimpleEvent({
    event: "plus_button_clicked",
    triggered_from: "collection-header",
  });

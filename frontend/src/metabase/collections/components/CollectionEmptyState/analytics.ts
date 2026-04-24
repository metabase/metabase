import { trackSimpleEvent } from "metabase/analytics";

export const trackCollectionNewButtonClicked = () =>
  trackSimpleEvent({
    event: "new_button_clicked",
    triggered_from: "empty-collection",
  });

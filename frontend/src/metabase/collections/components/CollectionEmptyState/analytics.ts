import { trackSimpleEvent } from "metabase/utils/analytics";

export const trackCollectionNewButtonClicked = () =>
  trackSimpleEvent({
    event: "new_button_clicked",
    triggered_from: "empty-collection",
  });

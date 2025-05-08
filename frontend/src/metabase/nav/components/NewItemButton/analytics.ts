import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackAppNewButtonClicked = () =>
  trackSimpleEvent({
    event: "new_button_clicked",
    triggered_from: "app-bar",
  });

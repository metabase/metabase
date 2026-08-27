import { trackSimpleEvent } from "metabase/analytics";

export const trackEventsClicked = () =>
  trackSimpleEvent({
    event: "events_clicked",
    triggered_from: "chart",
  });

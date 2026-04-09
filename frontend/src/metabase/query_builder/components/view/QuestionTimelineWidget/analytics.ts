import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackEventsClicked = () =>
  trackSimpleEvent({
    event: "events_clicked",
    triggered_from: "chart",
  });

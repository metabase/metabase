import { trackSimpleEvent } from "metabase/utils/analytics";

export const trackEventsClicked = () =>
  trackSimpleEvent({
    event: "events_clicked",
    triggered_from: "chart",
  });

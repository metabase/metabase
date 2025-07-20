import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackNewMetricInitiated = () =>
  trackSimpleEvent({
    event: "plus_button_clicked",
    triggered_from: "metric",
  });

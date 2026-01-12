import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackNewMetricInitiated = () =>
  trackSimpleEvent({
    event: "plus_button_clicked",
    triggered_from: "metric",
  });

export const trackMetricBookmarked = () => {
  trackSimpleEvent({
    event: "bookmark_added",
    event_detail: "metric",
    triggered_from: "browse_metrics",
  });
};

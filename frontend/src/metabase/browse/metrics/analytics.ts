import { trackSimpleEvent } from "metabase/utils/analytics";

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

export const trackMetricPageShowMoreClicked = (metricId: number) => {
  trackSimpleEvent({
    event: "metric_page_show_more_clicked",
    target_id: metricId,
  });
};

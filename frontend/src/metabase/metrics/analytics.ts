import { trackSimpleEvent } from "metabase/analytics";

export const trackMetricPageShowMoreClicked = (metricId: number) => {
  trackSimpleEvent({
    event: "metric_page_show_more_clicked",
    target_id: metricId,
  });
};

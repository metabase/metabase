import { trackSimpleEvent } from "metabase/utils/analytics";

export const trackMetricsViewerMetricAdded = (
  targetId: number | null,
  eventDetail: "metric" | "measure",
) => {
  trackSimpleEvent({
    event: "metrics_viewer_metric_added",
    target_id: targetId,
    event_detail: eventDetail,
  });
};

export const trackMetricsViewerMetricRemoved = (
  targetId: number | null,
  eventDetail: "metric" | "measure",
) => {
  trackSimpleEvent({
    event: "metrics_viewer_metric_removed",
    target_id: targetId,
    event_detail: eventDetail,
  });
};

type FilterSource = "metric_filter" | "dimension_filter";

export const trackMetricsViewerFilterAdded = (triggeredFrom: FilterSource) => {
  trackSimpleEvent({
    event: "metrics_viewer_filter_added",
    triggered_from: triggeredFrom,
  });
};

export const trackMetricsViewerFilterEdited = (triggeredFrom: FilterSource) => {
  trackSimpleEvent({
    event: "metrics_viewer_filter_edited",
    triggered_from: triggeredFrom,
  });
};

export const trackMetricsViewerFilterRemoved = (
  triggeredFrom: FilterSource,
) => {
  trackSimpleEvent({
    event: "metrics_viewer_filter_removed",
    triggered_from: triggeredFrom,
  });
};

export const trackMetricsViewerDimensionTabAdded = () => {
  trackSimpleEvent({
    event: "metrics_viewer_dimension_tab_added",
  });
};

export const trackMetricsViewerDimensionTabSwitched = () => {
  trackSimpleEvent({
    event: "metrics_viewer_dimension_tab_switched",
  });
};

export const trackMetricsViewerDimensionTabRemoved = () => {
  trackSimpleEvent({
    event: "metrics_viewer_dimension_tab_removed",
  });
};

export const trackStackedSeriesEnabled = () => {
  trackSimpleEvent({
    event: "stack_series_enabled",
    triggered_from: "metrics_viewer",
  });
};

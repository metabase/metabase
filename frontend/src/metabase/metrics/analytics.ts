import { trackSimpleEvent } from "metabase/analytics";
import type { DimensionId, MetricId } from "metabase-types/api";

type MetricDimensionResult = "success" | "failure";

export const trackMetricPageShowMoreClicked = (metricId: number) => {
  trackSimpleEvent({
    event: "metric_page_show_more_clicked",
    target_id: metricId,
  });
};

export const trackMetricDimensionsTabViewed = (metricId: MetricId) => {
  trackSimpleEvent({
    event: "metric_dimensions_tab_viewed",
    target_id: metricId,
  });
};

export const trackMetricDimensionAdded = (
  metricId: MetricId,
  dimensionId: DimensionId,
  result: MetricDimensionResult,
) => {
  trackSimpleEvent({
    event: "metric_dimension_added",
    target_id: metricId,
    event_detail: dimensionId,
    result,
  });
};

export const trackMetricDimensionRemoved = (
  metricId: MetricId,
  dimensionId: DimensionId,
  result: MetricDimensionResult,
) => {
  trackSimpleEvent({
    event: "metric_dimension_removed",
    target_id: metricId,
    event_detail: dimensionId,
    result,
  });
};

export const trackMetricDimensionSetDefault = (
  metricId: MetricId,
  dimensionId: DimensionId,
  result: MetricDimensionResult,
) => {
  trackSimpleEvent({
    event: "metric_dimension_set_default",
    target_id: metricId,
    event_detail: dimensionId,
    result,
  });
};

export const trackMetricDimensionUpdated = (
  metricId: MetricId,
  dimensionId: DimensionId,
  result: MetricDimensionResult,
) => {
  trackSimpleEvent({
    event: "metric_dimension_updated",
    target_id: metricId,
    event_detail: dimensionId,
    result,
  });
};

export const trackMetricDimensionsReordered = (
  metricId: MetricId,
  result: MetricDimensionResult,
) => {
  trackSimpleEvent({
    event: "metric_dimensions_reordered",
    target_id: metricId,
    result,
  });
};

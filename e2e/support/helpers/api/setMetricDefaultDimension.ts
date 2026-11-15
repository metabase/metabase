import type {
  DimensionId,
  ListMetricDimensionsResponse,
  MetricId,
} from "metabase-types/api";

/**
 * Curate `displayName` as the metric's default dimension. Metrics are created
 * without one, so they preview as a scalar until a default is set. Reading the
 * metric seeds the curated dimension list this picks from.
 */
export const setMetricDefaultDimension = (
  metricId: MetricId,
  displayName: string,
) => {
  return cy
    .request("GET", `/api/metric/${metricId}`)
    .then(() =>
      cy.request<ListMetricDimensionsResponse>(
        "GET",
        `/api/metric/${metricId}/dimension`,
      ),
    )
    .then(({ body }) => {
      const dimension = body.added.find(
        (candidate) => candidate.display_name === displayName,
      );

      expect(dimension, `${displayName} dimension`).to.exist;
      return cy.request<DimensionId>(
        "POST",
        `/api/metric/${metricId}/dimension/set-default`,
        { dimension_id: dimension?.id },
      );
    });
};

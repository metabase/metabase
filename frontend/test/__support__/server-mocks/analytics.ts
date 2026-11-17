import fetchMock from "fetch-mock";

export function setupInternalAnalyticsEndpoint() {
  fetchMock.post("path:/api/analytics/internal", 204);
}

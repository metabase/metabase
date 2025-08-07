import fetchMock from "fetch-mock";

import type { AIEntityAnalysisResponse } from "metabase-types/api";

export function setupAnalyzeChartEndpoint({
  response,
  overwriteRoute,
}: {
  response: AIEntityAnalysisResponse;
  overwriteRoute?: boolean;
}) {
  const name = "ai-analyze-chart";
  if (overwriteRoute) {
    fetchMock.removeRoute(name);
  }
  fetchMock.removeRoute(name);
  fetchMock.post("path:/api/ee/ai-entity-analysis/analyze-chart", response, {
    name,
  });
}

import fetchMock from "fetch-mock";

import type { AIEntityAnalysisResponse } from "metabase-types/api";

export function setupAnalyzeChartEndpoint(response: AIEntityAnalysisResponse) {
  fetchMock.post("path:/api/ee/ai-entity-analysis/analyze-chart", response, {
    overwriteRoutes: true,
  });
}

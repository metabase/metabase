import type {
  AIEntityAnalysisResponse,
  AIQuestionAnalysisParams,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

const DEFAULT_TIMEOUT = 30000;

export const aiEntityAnalysisApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    analyzeChart: builder.mutation<
      AIEntityAnalysisResponse,
      AIQuestionAnalysisParams
    >({
      query: ({ imageBase64, name, description, timelineEvents }) => {
        return {
          url: "/api/ee/ai-entity-analysis/analyze-chart",
          method: "POST",
          body: {
            image_base64: imageBase64,
            name,
            description,
            timeline_events: timelineEvents,
          },
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
        };
      },
    }),
  }),
});

export const { useAnalyzeChartMutation } = aiEntityAnalysisApi;

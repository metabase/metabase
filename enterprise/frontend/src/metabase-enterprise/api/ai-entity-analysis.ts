import { EnterpriseApi } from "./api";

export interface AIEntityAnalysisResponse {
  summary: string;
}

export interface TimelineEvent {
  name: string;
  description?: string;
  timestamp: string;
}

export interface AIQuestionAnalysisParams {
  imageBase64: string;
  name?: string;
  description?: string;
  timelineEvents?: TimelineEvent[];
}

export interface AIDashboardAnalysisParams {
  imageBase64: string;
  name?: string;
  description?: string;
  tabName?: string;
}

export const aiAnalysisApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    analyzeChart: builder.mutation<
      AIEntityAnalysisResponse,
      AIQuestionAnalysisParams
    >({
      query: ({ imageBase64, name, description, timelineEvents }) => {
        return {
          url: "/api/ee/ai-analysis/analyze-chart",
          method: "POST",
          body: {
            image_base64: imageBase64,
            name,
            description,
            timeline_events: timelineEvents,
          },
        };
      },
    }),

    analyzeDashboard: builder.mutation<
      AIEntityAnalysisResponse,
      AIDashboardAnalysisParams
    >({
      query: ({ imageBase64, name, description, tabName }) => {
        return {
          url: "/api/ee/ai-analysis/analyze-dashboard",
          method: "POST",
          body: {
            image_base64: imageBase64,
            name,
            description,
            tab_name: tabName,
          },
        };
      },
    }),
  }),
});

export const { useAnalyzeChartMutation, useAnalyzeDashboardMutation } =
  aiAnalysisApi;

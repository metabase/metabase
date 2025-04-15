import { EnterpriseApi } from "./api";

export interface AnalysisResponse {
  summary: string;
}

export interface AnalysisParams {
  image: File;
}

export const aiAnalysisApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    analyzeChart: builder.mutation<AnalysisResponse, AnalysisParams>({
      query: ({ image }) => {
        const formData = new FormData();
        formData.append("image", image);

        return {
          url: "/api/ee/ai-analysis/analyze-chart",
          method: "POST",
          body: { formData },
          formData: true,
          fetch: true,
        };
      },
    }),

    analyzeDashboard: builder.mutation<AnalysisResponse, AnalysisParams>({
      query: ({ image }) => {
        const formData = new FormData();
        formData.append("image", image);

        return {
          url: "/api/ee/ai-analysis/analyze-dashboard",
          method: "POST",
          body: { formData },
          formData: true,
          fetch: true,
        };
      },
    }),
  }),
});

export const { useAnalyzeChartMutation, useAnalyzeDashboardMutation } =
  aiAnalysisApi;

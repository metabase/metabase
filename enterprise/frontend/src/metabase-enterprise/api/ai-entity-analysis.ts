import { EnterpriseApi } from "./api";

export interface AnalysisResponse {
  summary: string;
}

export interface AnalysisParams {
  image: File;
  name: string;
  description?: string;
  timelineEvents?: {
    name: string;
    description?: string;
    timestamp: string;
  }[];
}

export interface AnalysisDashboardParams extends AnalysisParams {
  tabName?: string;
}

export const aiAnalysisApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    analyzeChart: builder.mutation<AnalysisResponse, AnalysisParams>({
      query: ({ image, name, description, timelineEvents }) => {
        const formData = new FormData();
        formData.append("image", image);
        formData.append("name", name);
        if (description) {
          formData.append("description", description);
        }
        if (timelineEvents && timelineEvents.length > 0) {
          formData.append("timeline_events", JSON.stringify(timelineEvents));
        }

        return {
          url: "/api/ee/ai-analysis/analyze-chart",
          method: "POST",
          body: { formData },
          formData: true,
          fetch: true,
        };
      },
    }),

    analyzeDashboard: builder.mutation<
      AnalysisResponse,
      AnalysisDashboardParams
    >({
      query: ({ image, name, description, tabName }) => {
        const formData = new FormData();
        formData.append("image", image);
        formData.append("name", name);
        if (description) {
          formData.append("description", description);
        }
        if (tabName) {
          formData.append("tab_name", tabName);
        }

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

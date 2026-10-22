import { openSaveDialog } from "metabase/utils/dom";
import { EnterpriseApi } from "metabase-enterprise/api/api";

export interface ExportAnalyticsResponse {
  filename: string;
}

// Passed as fixedCacheKey so every useExportAnalyticsMutation call shares one mutation result.
export const ANALYTICS_EXPORT_CACHE_KEY = "analytics-export";

export const analyticsExportApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    exportAnalytics: builder.mutation<ExportAnalyticsResponse, void>({
      async queryFn(_arg, { signal }) {
        try {
          const response = await fetch(
            "/api/ee/audit-app/analytics-dev/export",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              credentials: "include",
              signal,
            },
          );

          if (!response.ok) {
            return { error: new Error("Export failed") };
          }

          const contentDisposition = response.headers.get(
            "Content-Disposition",
          );
          const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
          const filename = filenameMatch?.[1] || "analytics-export.tar.gz";

          const fileContent = await response.blob();
          openSaveDialog(filename, fileContent);

          return { data: { filename } };
        } catch (error) {
          return { error };
        }
      },
    }),
  }),
});

export const { useExportAnalyticsMutation } = analyticsExportApi;

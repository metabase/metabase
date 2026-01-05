import { openSaveDialog } from "metabase/lib/dom";

import { Api } from "./api";

export interface ExportAnalyticsResponse {
  filename: string;
}

export const analyticsApi = Api.injectEndpoints({
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

export const { useExportAnalyticsMutation } = analyticsApi;

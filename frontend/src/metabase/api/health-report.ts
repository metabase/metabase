import { Api } from "./api";

export type HealthReportResponse = { reportMarkdown: string };

export const healthApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getHealthReport: builder.query<HealthReportResponse, void>({
      query: () => ({
        method: "GET",
        url: `/api/doctor`,
      }),
    }),
  }),
});

export const { useGetHealthReportQuery } = healthApi;

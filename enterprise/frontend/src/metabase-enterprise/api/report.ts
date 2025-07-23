import type { Report, ReportId, ReportVersions } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag } from "./tags";

export const reportApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getReport: builder.query<Report, { id: ReportId; version?: number }>({
      query: ({ id, version }) => ({
        method: "GET",
        url: `/api/ee/report/${id}`,
        params: { version },
      }),
      providesTags: (result, error, { id }) =>
        !error ? [idTag("report", id)] : [],
    }),
    createReport: builder.mutation<Report, Pick<Report, "name" | "document">>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/report",
        body: body,
      }),
      invalidatesTags: (_, error) => (error ? [] : []), // TODO: invalidate parent collection?
    }),
    updateReport: builder.mutation<
      Report,
      Pick<Report, "id" | "name" | "document">
    >({
      query: (report) => ({
        method: "PUT",
        url: `/api/ee/report/${report.id}`,
        body: report,
      }),
      invalidatesTags: (_, error, { id }) =>
        !error ? [idTag("report", id), idTag("report-versions", id)] : [],
    }),
    getReportVersions: builder.query<ReportVersions, { id: ReportId }>({
      query: ({ id }) => ({
        method: "GET",
        url: `/api/ee/report/${id}/versions`,
      }),
      providesTags: (result, error, { id }) =>
        !error ? [idTag("report-versions", id)] : [],
    }),
  }),
});

export const {
  useGetReportQuery,
  useCreateReportMutation,
  useUpdateReportMutation,
  useGetReportVersionsQuery,
} = reportApi;

import type { Report, ReportId } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag } from "./tags";

export const reportApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getReport: builder.query<Report, ReportId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/report/${id}`,
      }),
      providesTags: (result, error, id) =>
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
        !error ? [idTag("report", id)] : [],
    }),
  }),
});

export const {
  useGetReportQuery,
  useCreateReportMutation,
  useUpdateReportMutation,
} = reportApi;

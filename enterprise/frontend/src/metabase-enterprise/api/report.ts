import type { CreateReportRequest, Report, ReportId } from "metabase-types/api";

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
    createReport: builder.mutation<Report, CreateReportRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/report",
        body,
      }),
      invalidatesTags: (_, error) => (error ? [] : []), // TODO: invalidate parent collection?
    }),
    updateReport: builder.mutation<
      Report,
      Pick<Report, "id" | "name" | "document"> & {
        used_card_ids?: number[];
      }
    >({
      query: (report) => ({
        method: "PUT",
        url: `/api/ee/report/${report.id}`,
        body: report,
      }),
      invalidatesTags: (_, error, { id }) =>
        !error ? [idTag("report", id), idTag("report-versions", id)] : [],
    }),
  }),
});

export const {
  useGetReportQuery,
  useCreateReportMutation,
  useUpdateReportMutation,
} = reportApi;

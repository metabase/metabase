import type {
  Card,
  Dataset,
  Report,
  ReportId,
  ReportVersions,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag } from "./tags";

type ReportSnapshot = {
  snapshot_id: number;
  card_id: number;
};

type CreateSnapshotRequest = {
  report_id?: number;
} & (
  | { card_id: number }
  | Omit<Card, "id" | "creator_id" | "created_at" | "updated_at">
);

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
        body,
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
    createReportSnapshot: builder.mutation<
      ReportSnapshot,
      CreateSnapshotRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/report/snapshot",
        body,
      }),
    }),
    getReportSnapshot: builder.query<Dataset, number>({
      query: (snapshotId) => ({
        method: "GET",
        url: `/api/ee/report/snapshot/${snapshotId}`,
      }),
    }),
  }),
});

export const {
  useGetReportQuery,
  useCreateReportMutation,
  useUpdateReportMutation,
  useGetReportVersionsQuery,
  useCreateReportSnapshotMutation,
  useGetReportSnapshotQuery,
} = reportApi;

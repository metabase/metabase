import type { BugReportDetails, ErrorPayload } from "metabase-types/api";

import { Api } from "./api";

interface BugReportResponse {
  success: boolean;
}

export const bugReportApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    sendBugReport: builder.mutation<
      BugReportResponse,
      { diagnosticInfo: ErrorPayload }
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/slack/bug-report",
        body,
      }),
    }),
    getBugReportDetails: builder.query<BugReportDetails, void>({
      query: () => "/api/bug-reporting/details",
    }),
  }),
});

export const {
  useSendBugReportMutation,
  useGetBugReportDetailsQuery,
  useLazyGetBugReportDetailsQuery,
} = bugReportApi;

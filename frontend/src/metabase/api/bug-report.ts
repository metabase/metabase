import type { ErrorPayload } from "metabase-types/api";

import { Api } from "./api";

interface BugReportResponse {
  success: boolean;
}

export const bugReportApi = Api.injectEndpoints({
  endpoints: builder => ({
    sendBugReport: builder.mutation<
      BugReportResponse,
      { diagnosticInfo: ErrorPayload }
    >({
      query: body => ({
        method: "POST",
        url: "/api/slack/bug-report",
        body,
      }),
    }),
  }),
});

export const { useSendBugReportMutation } = bugReportApi;

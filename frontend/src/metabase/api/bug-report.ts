import type { BugReportDetails, ErrorPayload } from "metabase-types/api";

import { Api } from "./api";
import legacyApi from "./legacy-client";

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

// This is not an API call: it returns a URL to be opened as an external link,
// which is why it can't use RTK Query. It needs `api.basename` so it works
// when Metabase is deployed at a subpath.
export const getConnectionPoolDetailsUrl = () => {
  const path = "/api/bug-reporting/connection-pool-details";
  const { href } = new URL(legacyApi.basename + path, location.origin);
  return href;
};

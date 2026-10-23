import { EnterpriseApi } from "metabase-enterprise/api/api";
import { listTag } from "metabase-enterprise/api/tags";
import type {
  AcknowledgeAdvisoriesResponse,
  AcknowledgeAdvisoryResponse,
  AdvisoryId,
  ListAdvisoriesResponse,
  SendTestNotificationRequest,
} from "metabase-types/api";

import type { HealthCheck } from "./types";

export const securityCenterApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listSecurityAdvisories: builder.query<ListAdvisoriesResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/security-center",
      }),
      providesTags: [listTag("security-advisory")],
    }),
    acknowledgeAdvisory: builder.mutation<AcknowledgeAdvisoryResponse, string>({
      query: (advisoryId) => ({
        method: "POST",
        url: `/api/ee/security-center/${advisoryId}/acknowledge`,
      }),
      invalidatesTags: [listTag("security-advisory")],
    }),
    acknowledgeAdvisories: builder.mutation<
      AcknowledgeAdvisoriesResponse,
      AdvisoryId[]
    >({
      query: (advisoryIds) => ({
        method: "POST",
        url: "/api/ee/security-center/acknowledge",
        body: { advisory_ids: advisoryIds },
      }),
      invalidatesTags: [listTag("security-advisory")],
    }),
    syncSecurityAdvisories: builder.mutation<void, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/security-center/sync",
      }),
      invalidatesTags: [listTag("security-advisory")],
    }),
    sendTestNotification: builder.mutation<
      { success: boolean },
      SendTestNotificationRequest
    >({
      query: ({ emailRecipients, slackChannel }) => ({
        method: "POST",
        url: "/api/ee/security-center/test-notification",
        body: {
          email_recipients: emailRecipients,
          slack_channel: slackChannel,
        },
      }),
    }),
    listHealthChecks: builder.query<HealthCheck[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/security-center/health-checks",
      }),
      providesTags: [listTag("security-health-check")],
    }),
    recheckHealthChecks: builder.mutation<HealthCheck[], void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/security-center/health-checks/recheck",
      }),
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            securityCenterApi.util.updateQueryData(
              "listHealthChecks",
              undefined,
              () => data,
            ),
          );
        } catch {}
      },
    }),
    recheckHealthCheck: builder.mutation<HealthCheck, string>({
      query: (checkId) => ({
        method: "POST",
        url: `/api/ee/security-center/health-checks/${checkId}/recheck`,
      }),
      onQueryStarted: async (_checkId, { dispatch, queryFulfilled }) => {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            securityCenterApi.util.updateQueryData(
              "listHealthChecks",
              undefined,
              (checks) =>
                checks.map((check) => (check.id === data.id ? data : check)),
            ),
          );
        } catch {}
      },
    }),
    acknowledgeHealthCheck: builder.mutation<void, string>({
      query: (checkId) => ({
        method: "POST",
        url: `/api/ee/security-center/health-checks/${checkId}/acknowledgement`,
      }),
      invalidatesTags: [listTag("security-health-check")],
    }),
    unacknowledgeHealthCheck: builder.mutation<void, string>({
      query: (checkId) => ({
        method: "DELETE",
        url: `/api/ee/security-center/health-checks/${checkId}/acknowledgement`,
      }),
      invalidatesTags: [listTag("security-health-check")],
    }),
  }),
});

export const {
  useListSecurityAdvisoriesQuery,
  useAcknowledgeAdvisoryMutation,
  useAcknowledgeAdvisoriesMutation,
  useSyncSecurityAdvisoriesMutation,
  useSendTestNotificationMutation,
  useListHealthChecksQuery,
  useRecheckHealthChecksMutation,
  useRecheckHealthCheckMutation,
  useAcknowledgeHealthCheckMutation,
  useUnacknowledgeHealthCheckMutation,
} = securityCenterApi;

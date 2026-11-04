import { handleQueryFulfilled } from "metabase/api/utils/lifecycle";
import { EnterpriseApi } from "metabase-enterprise/api/api";
import { listTag } from "metabase-enterprise/api/tags";
import type {
  AcknowledgeAdvisoriesResponse,
  AcknowledgeAdvisoryResponse,
  AdvisoryId,
  HealthCheck,
  HealthCheckId,
  ListAdvisoriesResponse,
  ListHealthChecksResponse,
  SendTestNotificationRequest,
} from "metabase-types/api";

const mergeChecks = (cached: HealthCheck[], fresh: HealthCheck[]) =>
  fresh.map((check) => {
    const cachedCheck = cached.find(({ id }) => id === check.id);
    const isCachedNewer =
      cachedCheck &&
      Date.parse(cachedCheck.checked_at) > Date.parse(check.checked_at);

    return isCachedNewer ? cachedCheck : check;
  });

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
    listHealthChecks: builder.query<ListHealthChecksResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/security-center/health-checks",
      }),
      providesTags: [listTag("security-health-check")],
    }),
    recheckHealthCheck: builder.mutation<HealthCheck, HealthCheckId>({
      query: (checkId) => ({
        method: "POST",
        url: `/api/ee/security-center/health-checks/${checkId}/recheck`,
      }),
      invalidatesTags: (_result, error) =>
        error ? [listTag("security-health-check")] : [],
      onQueryStarted: (checkId, { dispatch, queryFulfilled }) =>
        handleQueryFulfilled(queryFulfilled, (recheckedCheck) =>
          dispatch(
            securityCenterApi.util.updateQueryData(
              "listHealthChecks",
              undefined,
              (draft) => {
                draft.checks = mergeChecks(
                  draft.checks,
                  draft.checks.map((check) =>
                    check.id === checkId ? recheckedCheck : check,
                  ),
                );
              },
            ),
          ),
        ),
    }),
    recheckHealthChecks: builder.mutation<ListHealthChecksResponse, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/security-center/health-checks/recheck",
      }),
      onQueryStarted: (_arg, { dispatch, queryFulfilled }) =>
        handleQueryFulfilled(queryFulfilled, ({ checks }) =>
          dispatch(
            securityCenterApi.util.updateQueryData(
              "listHealthChecks",
              undefined,
              (draft) => {
                draft.checks = mergeChecks(draft.checks, checks);
              },
            ),
          ),
        ),
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
  useRecheckHealthCheckMutation,
  useRecheckHealthChecksMutation,
} = securityCenterApi;

import type {
  AcknowledgeAdvisoriesResponse,
  AcknowledgeAdvisoryResponse,
  AdvisoryId,
  ListAdvisoriesResponse,
  NotificationRecipient,
} from "metabase-types/api";

import { Api } from "./api";
import { listTag } from "./tags";

export type SendTestNotificationBody = {
  email_recipients: NotificationRecipient[];
  slack_channel: string | null;
};

export const securityCenterApi = Api.injectEndpoints({
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
      SendTestNotificationBody
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/security-center/test-notification",
        body,
      }),
    }),
  }),
});

export const {
  useListSecurityAdvisoriesQuery,
  useAcknowledgeAdvisoryMutation,
  useAcknowledgeAdvisoriesMutation,
  useSyncSecurityAdvisoriesMutation,
  useSendTestNotificationMutation,
} = securityCenterApi;

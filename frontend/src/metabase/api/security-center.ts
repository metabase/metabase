import { Api } from "metabase/api";
import type {
  AcknowledgeAdvisoryResponse,
  ListAdvisoriesResponse,
} from "metabase-types/api";

import { listTag } from "./tags";
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
    syncSecurityAdvisories: builder.mutation<void, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/security-center/sync",
      }),
      invalidatesTags: [listTag("security-advisory")],
    }),
    sendTestNotification: builder.mutation<{ success: boolean }, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/security-center/test-notification",
      }),
    }),
  }),
});

export const {
  useListSecurityAdvisoriesQuery,
  useAcknowledgeAdvisoryMutation,
  useSyncSecurityAdvisoriesMutation,
  useSendTestNotificationMutation,
} = securityCenterApi;

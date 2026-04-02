import { Api } from "metabase/api";

import { listTag } from "./tags";

export type AdvisoryMatchStatus =
  | "active"
  | "resolved"
  | "not_affected"
  | "error";

export type AdvisoryVersionRange = {
  min: string;
  fixed: string;
};

export type ApiAdvisory = {
  advisory_id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  advisory_url: string | null;
  remediation: string;
  published_at: string;
  match_status: AdvisoryMatchStatus;
  last_evaluated_at: string | null;
  acknowledged_by: { id: number; common_name: string; email: string } | null;
  acknowledged_at: string | null;
  affected_versions: AdvisoryVersionRange[];
};

export type ListAdvisoriesResponse = {
  last_checked_at: string | null;
  advisories: ApiAdvisory[];
};

export type AcknowledgeAdvisoryResponse = {
  advisory_id: string;
  match_status: AdvisoryMatchStatus;
  acknowledged_by: { id: number; common_name: string; email: string } | null;
  acknowledged_at: string | null;
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

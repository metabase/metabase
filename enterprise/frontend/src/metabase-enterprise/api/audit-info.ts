import type { AuditInfo } from "metabase-enterprise/audit_app/types/state";
import type { UserId } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, listTag } from "./tags";

export const auditInfoApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAuditInfo: builder.query<AuditInfo, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/audit-app/user/audit-info",
      }),
    }),
    unsubscribeUserFromSubscriptions: builder.mutation<void, UserId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/audit-app/user/${id}/subscriptions`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          listTag("subscription"),
          listTag("alert"),
          listTag("notification"),
        ]),
    }),
  }),
});

export const {
  useGetAuditInfoQuery,
  useUnsubscribeUserFromSubscriptionsMutation,
} = auditInfoApi;

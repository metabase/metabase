import { Api } from "metabase/api";
import type { AuditInfo } from "metabase-enterprise/audit_app/types/state";

export const auditInfoApi = Api.injectEndpoints({
  endpoints: builder => ({
    getAuditInfo: builder.query<AuditInfo, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/audit-app/user/audit-info",
      }),
    }),
  }),
});

export const { useGetAuditInfoQuery } = auditInfoApi;

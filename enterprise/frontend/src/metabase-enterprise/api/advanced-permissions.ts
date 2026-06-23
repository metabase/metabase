import type { DatabaseId, GroupId, Impersonation } from "metabase-types/api";

import { EnterpriseApi } from "./api";

interface GetImpersonationRequest {
  db_id: DatabaseId;
  group_id: GroupId;
}

export const advancedPermissionsApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getImpersonation: builder.query<Impersonation, GetImpersonationRequest>({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/advanced-permissions/impersonation",
        params,
      }),
    }),
  }),
});

export const { useGetImpersonationQuery } = advancedPermissionsApi;

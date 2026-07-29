import type { ApplicationPermissions } from "metabase-enterprise/application_permissions/types/permissions";

import { EnterpriseApi } from "./api";

interface ApplicationPermissionsGraph {
  groups: ApplicationPermissions;
  revision: number;
}

type UpdateApplicationPermissionsGraphRequest = ApplicationPermissionsGraph;

export const applicationPermissionsApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getApplicationPermissionsGraph: builder.query<
      ApplicationPermissionsGraph,
      void
    >({
      query: () => ({
        method: "GET",
        url: "/api/ee/advanced-permissions/application/graph",
      }),
    }),
    updateApplicationPermissionsGraph: builder.mutation<
      ApplicationPermissionsGraph,
      UpdateApplicationPermissionsGraphRequest
    >({
      query: (body) => ({
        method: "PUT",
        url: "/api/ee/advanced-permissions/application/graph",
        body,
      }),
    }),
  }),
});

export const {
  useGetApplicationPermissionsGraphQuery,
  useUpdateApplicationPermissionsGraphMutation,
} = applicationPermissionsApi;

import type { ApplicationPermissionsGraph } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, listTag } from "./tags";

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
      providesTags: () => [listTag("application-permissions-graph")],
    }),
    updateApplicationPermissionsGraph: builder.mutation<
      ApplicationPermissionsGraph,
      ApplicationPermissionsGraph
    >({
      query: (body) => ({
        method: "PUT",
        url: "/api/ee/advanced-permissions/application/graph",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("application-permissions-graph")]),
    }),
  }),
});

export const {
  useGetApplicationPermissionsGraphQuery,
  useUpdateApplicationPermissionsGraphMutation,
} = applicationPermissionsApi;

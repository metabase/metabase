import _ from "underscore";

import type { ApplicationPermissionsGraph } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { listTag } from "./tags";

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
      async onQueryStarted(_body, { dispatch, queryFulfilled }) {
        await queryFulfilled.then(({ data }) => {
          dispatch(
            applicationPermissionsApi.util.upsertQueryData(
              "getApplicationPermissionsGraph",
              undefined,
              data,
            ),
          );
        }, _.noop);
      },
    }),
  }),
});

export const {
  useGetApplicationPermissionsGraphQuery,
  useUpdateApplicationPermissionsGraphMutation,
} = applicationPermissionsApi;

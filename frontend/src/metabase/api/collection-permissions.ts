import type {
  CollectionPermissions,
  CollectionPermissionsGraph,
} from "metabase-types/api";

import { Api } from "./api";
import { invalidateTags, tag } from "./tags";

type GetCollectionPermissionsGraphRequest = {
  namespace?: string | null;
};

type UpdateCollectionPermissionsGraphRequest = {
  namespace?: string | null;
  revision: number;
  groups: CollectionPermissions;
};

export const collectionPermissionsApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getCollectionPermissionsGraph: builder.query<
      CollectionPermissionsGraph,
      GetCollectionPermissionsGraphRequest | void
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/collection/graph",
        params: params?.namespace ? { namespace: params.namespace } : undefined,
      }),
      providesTags: (_result, _error, params) => [
        tag("collection-permissions"),
        {
          type: "collection-permissions" as const,
          id: params?.namespace ?? "default",
        },
      ],
    }),

    updateCollectionPermissionsGraph: builder.mutation<
      CollectionPermissionsGraph,
      UpdateCollectionPermissionsGraphRequest
    >({
      query: ({ namespace, revision, groups }) => ({
        method: "PUT",
        url: "/api/collection/graph",
        params: { "skip-graph": true },
        body: { namespace, revision, groups },
      }),
      invalidatesTags: (result, error, { namespace }) =>
        invalidateTags(error, [
          tag("collection-permissions"),
          {
            type: "collection-permissions" as const,
            id: namespace ?? "default",
          },
        ]),
    }),
  }),
});

export const {
  useGetCollectionPermissionsGraphQuery,
  useUpdateCollectionPermissionsGraphMutation,
} = collectionPermissionsApi;

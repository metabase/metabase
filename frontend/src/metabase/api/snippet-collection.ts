import type { Collection, ListCollectionsRequest } from "metabase-types/api";

import { Api } from "./api";
import { collectionApi } from "./collection";

export const snippetCollectionApi = Api.injectEndpoints({
  endpoints: builder => ({
    listSnippetCollections: builder.query<Collection[], ListCollectionsRequest>(
      {
        queryFn: async (params = {}, queryApi) => {
          const result = await queryApi.dispatch(
            collectionApi.endpoints.listCollections.initiate({
              ...params,
              namespace: "snippets",
            }),
          );

          if (result.error) {
            return { error: result.error };
          }
          return { data: result.data };
        },
      },
    ),
    getSnippetCollection: builder.query<Collection, Pick<Collection, "id">>({
      queryFn: async ({ id }, queryApi) => {
        const result = await queryApi.dispatch(
          collectionApi.endpoints.getCollection.initiate({
            id,
            namespace: "snippets",
          }),
        );

        if (result.error) {
          return { error: result.error };
        }
        return { data: result.data };
      },
    }),
  }),
});

export const { useListSnippetCollectionsQuery, useGetSnippetCollectionQuery } = snippetCollectionApi;

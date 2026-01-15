import type {
  CacheConfig,
  CacheableModel,
  ListCacheConfigsRequest,
  ListCacheConfigsResponse,
} from "metabase-types/api";

import { Api } from "./api";

export const cacheConfigApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listCacheConfigs: builder.query<
      ListCacheConfigsResponse,
      ListCacheConfigsRequest | void
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/cache",
        params,
      }),
      providesTags: ["cache-config"],
    }),
    updateCacheConfig: builder.mutation<CacheConfig, CacheConfig>({
      query: (config) => ({
        method: "PUT",
        url: "/api/cache",
        body: config,
      }),
      invalidatesTags: ["cache-config"],
    }),
    deleteCacheConfig: builder.mutation<
      void,
      { model: CacheableModel; model_id: number }
    >({
      query: ({ model, model_id }) => ({
        method: "DELETE",
        url: "/api/cache",
        body: { model, model_id },
      }),
      invalidatesTags: ["cache-config"],
    }),
  }),
});

export const {
  useListCacheConfigsQuery,
  useUpdateCacheConfigMutation,
  useDeleteCacheConfigMutation,
} = cacheConfigApi;

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
    deleteCacheConfigs: builder.mutation<
      void,
      { model: CacheableModel; model_id: number | number[] }
    >({
      query: (body) => ({
        method: "DELETE",
        url: "/api/cache",
        body,
      }),
      extraOptions: {
        hasBody: true,
      },
      invalidatesTags: ["cache-config"],
    }),
    invalidateCacheConfigs: builder.mutation<
      void,
      {
        include?: "overrides";
        database?: number | number[];
        dashboard?: number | number[];
        question?: number | number[];
      }
    >({
      query: (params) => ({
        method: "POST",
        url: "/api/cache/invalidate",
        params,
      }),
      extraOptions: {
        hasBody: false,
      },
    }),
  }),
});

export const {
  useListCacheConfigsQuery,
  useUpdateCacheConfigMutation,
  useDeleteCacheConfigsMutation,
  useInvalidateCacheConfigsMutation,
} = cacheConfigApi;

import type { CacheConfig, CacheableModel } from "metabase-types/api";
import type {
  ListCacheConfigsRequest,
  ListCacheConfigsResponse,
  UpdateCacheConfigRequest,
} from "metabase-types/api/cache-config";

import { Api } from "./api";
import {
  cacheIdTag,
  invalidateTags,
  listTag,
  provideCacheConfigListTags,
} from "./tags";

export const cacheConfigApi = Api.injectEndpoints({
  endpoints: builder => ({
    listCacheConfigs: builder.query<
      ListCacheConfigsResponse,
      ListCacheConfigsRequest | void
    >({
      query: params => ({
        method: "GET",
        url: "/api/cache",
        params,
      }),
      providesTags: response =>
        provideCacheConfigListTags(response?.data ?? []),
    }),
    updateCacheConfig: builder.mutation<CacheConfig, UpdateCacheConfigRequest>({
      query: cacheConfig => ({
        method: "PUT",
        url: "/api/cache",
        body: cacheConfig,
      }),
      invalidatesTags: (_, error, cacheConfig) =>
        invalidateTags(error, [
          listTag("cache-config"),
          cacheIdTag(cacheConfig),
        ]),
    }),
    deleteCacheConfig: builder.mutation<
      void,
      { model: CacheableModel; model_id: number }
    >({
      query: cacheConfig => ({
        method: "DELETE",
        url: "/api/cache",
        body: cacheConfig,
      }),
      invalidatesTags: (_, error, cacheConfig) =>
        invalidateTags(error, [
          listTag("cache-config"),
          cacheIdTag(cacheConfig),
        ]),
    }),
    // This mutation invalidates the cache for a specific model (such as a
    // question, dashboard, or database). It doesn't need to invalidate RTK's
    // cache
    invalidateCacheConfig: builder.mutation<
      void,
      { model: CacheableModel; model_id: number }
    >({
      query: cacheConfig => ({
        method: "POST",
        url: "/api/cache/invalidate",
        body: cacheConfig,
      }),
    }),
  }),
});

export const {
  useListCacheConfigsQuery,
  useUpdateCacheConfigMutation,
  useDeleteCacheConfigMutation,
  useInvalidateCacheConfigMutation,
} = cacheConfigApi;

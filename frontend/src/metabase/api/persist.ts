import type {
  ListPersistedInfoResponse,
  CardId,
  ListPersistedInfoRequest,
  ModelCacheRefreshStatus,
  PersistedInfoId,
  PersistedInfoRefreshSchedule,
} from "metabase-types/api";

import { Api } from "./api";
import {
  invalidateTags,
  listTag,
  providePersistedInfoListTags,
  providePersistedInfoTags,
  providePersistedModelTags,
} from "./tags";

export const persistApi = Api.injectEndpoints({
  endpoints: builder => ({
    listPersistedInfo: builder.query<
      ListPersistedInfoResponse,
      ListPersistedInfoRequest | void
    >({
      query: params => ({
        method: "GET",
        url: "/api/persist",
        params,
      }),
      providesTags: response =>
        response ? providePersistedInfoListTags(response.data) : [],
    }),
    getPersistedInfo: builder.query<ModelCacheRefreshStatus, PersistedInfoId>({
      query: id => ({
        method: "GET",
        url: `/api/persist/${id}`,
      }),
      providesTags: model => (model ? providePersistedInfoTags(model) : []),
    }),
    getPersistedInfoByCard: builder.query<ModelCacheRefreshStatus, CardId>({
      query: id => ({
        method: "GET",
        url: `/api/persist/card/${id}`,
      }),
      providesTags: model => (model ? providePersistedModelTags(model) : []),
    }),
    enablePersist: builder.mutation<void, void>({
      query: () => ({
        method: "POST",
        url: "/api/persist/enable",
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("persisted-info")]),
    }),
    disablePersist: builder.mutation<void, void>({
      query: () => ({
        method: "POST",
        url: "/api/persist/disable",
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("persisted-info")]),
    }),
    setRefreshSchedule: builder.mutation<void, PersistedInfoRefreshSchedule>({
      query: body => ({
        method: "POST",
        url: "/api/persist/set-refresh/schedule",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("persisted-info")]),
    }),
  }),
});

export const {
  useListPersistedInfoQuery,
  useGetPersistedInfoQuery,
  useGetPersistedInfoByCardQuery,
  useEnablePersistMutation,
  useDisablePersistMutation,
  useSetRefreshScheduleMutation,
} = persistApi;

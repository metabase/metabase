import type {
  ListPersistedInfoResponse,
  CardId,
  ListPersistedInfoRequest,
  ModelCacheRefreshStatus,
  PersistedInfoId,
} from "metabase-types/api";

import { Api } from "./api";

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
    }),
    getPersistedInfo: builder.query<ModelCacheRefreshStatus, PersistedInfoId>({
      query: id => ({
        method: "GET",
        url: `/api/persist/${id}`,
      }),
    }),
    getPersistedInfoByCard: builder.query<ModelCacheRefreshStatus, CardId>({
      query: id => ({
        method: "GET",
        url: `/api/persist/card/${id}`,
      }),
    }),
    enablePersist: builder.query<void, void>({
      query: () => ({
        method: "POST",
        url: "/api/persist/enable",
      }),
    }),
    disablePersist: builder.query<void, void>({
      query: () => ({
        method: "POST",
        url: "/api/persist/disable",
      }),
    }),
    setRefreshSchedule: builder.mutation<unknown, unknown>({
      query: body => ({
        method: "POST",
        url: "/api/persist/set-refresh/schedule",
        body,
      }),
    }),
  }),
});

export const {
  useListPersistedInfoQuery,
  useGetPersistedInfoQuery,
  useGetPersistedInfoByCardQuery,
  useEnablePersistQuery,
  useDisablePersistQuery,
  useSetRefreshScheduleMutation,
} = persistApi;

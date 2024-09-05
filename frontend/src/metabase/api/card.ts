import type {
  Card,
  CardId,
  CardQueryMetadata,
  CreateCardRequest,
  GetCardRequest,
  ListCardsRequest,
  UpdateCardRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideCardListTags,
  provideCardQueryMetadataTags,
  provideCardTags,
} from "./tags";

export const cardApi = Api.injectEndpoints({
  endpoints: builder => ({
    listCards: builder.query<Card[], ListCardsRequest | void>({
      query: params => ({
        method: "GET",
        url: "/api/card",
        params,
      }),
      providesTags: (cards = []) => provideCardListTags(cards),
    }),
    getCard: builder.query<Card, GetCardRequest>({
      query: ({ id, ignore_error, ...params }) => ({
        method: "GET",
        url: `/api/card/${id}`,
        params,
        noEvent: ignore_error,
      }),
      providesTags: card => (card ? provideCardTags(card) : []),
    }),
    getCardQueryMetadata: builder.query<CardQueryMetadata, CardId>({
      query: id => ({
        method: "GET",
        url: `/api/card/${id}/query_metadata`,
      }),
      providesTags: (metadata, error, id) =>
        metadata ? provideCardQueryMetadataTags(id, metadata) : [],
    }),
    createCard: builder.mutation<Card, CreateCardRequest>({
      query: body => ({
        method: "POST",
        url: "/api/card",
        body,
      }),
      invalidatesTags: (_, error) => invalidateTags(error, [listTag("card")]),
    }),
    updateCard: builder.mutation<Card, UpdateCardRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/card/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("card"),
          idTag("card", id),
          idTag("table", `card__${id}`),
        ]),
    }),
    deleteCard: builder.mutation<void, CardId>({
      query: id => ({
        method: "DELETE",
        url: `/api/card/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("card"),
          idTag("card", id),
          idTag("table", `card__${id}`),
        ]),
    }),
    copyCard: builder.mutation<Card, CardId>({
      query: id => ({
        method: "POST",
        url: `/api/card/${id}/copy`,
      }),
      invalidatesTags: (_, error) => invalidateTags(error, [listTag("card")]),
    }),
    persistModel: builder.mutation<void, CardId>({
      query: id => ({
        method: "POST",
        url: `/api/card/${id}/persist`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          idTag("card", id),
          idTag("persisted-model", id),
          listTag("persisted-info"),
        ]),
    }),
    unpersistModel: builder.mutation<void, CardId>({
      query: id => ({
        method: "POST",
        url: `/api/card/${id}/unpersist`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          idTag("card", id),
          idTag("persisted-model", id),
          listTag("persisted-info"),
        ]),
    }),
    refreshModelCache: builder.mutation<void, CardId>({
      query: id => ({
        method: "POST",
        url: `/api/card/${id}/refresh`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          idTag("card", id),
          idTag("persisted-model", id),
          listTag("persisted-info"),
        ]),
    }),
  }),
});

export const {
  useListCardsQuery,
  useGetCardQuery,
  useGetCardQueryMetadataQuery,
  useCreateCardMutation,
  useUpdateCardMutation,
  useDeleteCardMutation,
  useCopyCardMutation,
  useRefreshModelCacheMutation,
  usePersistModelMutation,
  useUnpersistModelMutation,
} = cardApi;

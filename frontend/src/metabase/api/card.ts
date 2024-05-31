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
  provideCardListTags,
  provideCardTags,
  idTag,
  invalidateTags,
  listTag,
  provideCardMetadataTags,
} from "./tags";

export const cardApi = Api.injectEndpoints({
  endpoints: builder => ({
    listCards: builder.query<Card[], ListCardsRequest | void>({
      query: body => ({
        method: "GET",
        url: "/api/card",
        body,
      }),
      providesTags: (cards = []) => provideCardListTags(cards),
    }),
    getCard: builder.query<Card, GetCardRequest>({
      query: ({ id, ignore_error, ...body }) => ({
        method: "GET",
        url: `/api/card/${id}`,
        body,
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
        metadata ? provideCardMetadataTags(id, metadata) : [],
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
  useCreateCardMutation,
  useUpdateCardMutation,
  useDeleteCardMutation,
  useCopyCardMutation,
  useRefreshModelCacheMutation,
} = cardApi;

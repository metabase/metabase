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
  provideCardQueryMetadataTags,
} from "./tags";

export const chatCardApi = Api.injectEndpoints({
  endpoints: builder => ({
    listChatCards: builder.query<Card[], ListCardsRequest | void>({
      query: params => ({
        method: "GET",
        url: "/api/chat_card",
        params,
      }),
      providesTags: (chatCards = []) => provideCardListTags(chatCards),
    }),
    listChatCardsByDatabaseId: builder.query<
      { id: number; name: string; description: string | null }[],
      { database_id: number }
    >({
      query: ({ database_id }) => ({
        method: "GET",
        url: `/api/chat_card`,
        params: { database_id },
      }),
      transformResponse: (response: Card[]) =>
        response.map(({ id, name, description }) => ({
          id,
          name,
          description,
        })),
    }),
    getChatCard: builder.query<Card, GetCardRequest>({
      query: ({ id, ignore_error, ...params }) => ({
        method: "GET",
        url: `/api/chat_card/${id}`,
        params,
        noEvent: ignore_error,
      }),
      providesTags: chatCard => (chatCard ? provideCardTags(chatCard) : []),
    }),
    getChatCardQueryMetadata: builder.query<CardQueryMetadata, CardId>({
      query: id => ({
        method: "GET",
        url: `/api/chat_card/${id}/query_metadata`,
      }),
      providesTags: (metadata, error, id) =>
        metadata ? provideCardQueryMetadataTags(id, metadata) : [],
    }),
    createChatCard: builder.mutation<Card, CreateCardRequest>({
      query: body => ({
        method: "POST",
        url: "/api/chat_card",
        body,
      }),
      invalidatesTags: (_, error) => invalidateTags(error, [listTag("chat_card")]),
    }),
    updateChatCard: builder.mutation<Card, UpdateCardRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/chat_card/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("chat_card"),
          idTag("chat_card", id),
          idTag("table", `chat_card__${id}`),
        ]),
    }),
    deleteChatCard: builder.mutation<void, CardId>({
      query: id => ({
        method: "DELETE",
        url: `/api/chat_card/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("chat_card"),
          idTag("chat_card", id),
          idTag("table", `chat_card__${id}`),
        ]),
    }),
    copyChatCard: builder.mutation<Card, CardId>({
      query: id => ({
        method: "POST",
        url: `/api/chat_card/${id}/copy`,
      }),
      invalidatesTags: (_, error) => invalidateTags(error, [listTag("chat_card")]),
    }),
    refreshChatModelCache: builder.mutation<void, CardId>({
      query: id => ({
        method: "POST",
        url: `/api/chat_card/${id}/refresh`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          idTag("chat_card", id),
          idTag("persisted-model", id),
          listTag("persisted-info"),
        ]),
    }),
  }),
});

export const {
  useListChatCardsQuery,
  useListChatCardsByDatabaseIdQuery,
  useGetChatCardQuery,
  useGetChatCardQueryMetadataQuery,
  useCreateChatCardMutation,
  useUpdateChatCardMutation,
  useDeleteChatCardMutation,
  useCopyChatCardMutation,
  useRefreshChatModelCacheMutation,
} = chatCardApi;
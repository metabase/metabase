import type {
  Card,
  CardId,
  CardQueryMetadata,
  CardQueryRequest,
  CreateCardRequest,
  Dataset,
  GetCardRequest,
  GetEmbeddableCard,
  GetPublicCard,
  ListCardsRequest,
  UpdateCardKeyRequest,
  UpdateCardRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideCardListTags,
  provideCardQueryMetadataTags,
  provideCardQueryTags,
  provideCardTags,
} from "./tags";

const PERSISTED_MODEL_REFRESH_DELAY = 200;

export const cardApi = Api.injectEndpoints({
  endpoints: builder => {
    const updateCardPropertyMutation = <
      PropertyKey extends keyof UpdateCardRequest,
    >() =>
      builder.mutation<Card, UpdateCardKeyRequest<PropertyKey>>({
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
      });

    return {
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
      getCardQuery: builder.query<Dataset, CardQueryRequest>({
        query: ({ cardId, ...body }) => ({
          method: "POST",
          url: `/api/card/${cardId}/query`,
          body,
        }),
        providesTags: (_data, _error, { cardId }) =>
          provideCardQueryTags(cardId),
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
        async onQueryStarted(id, { dispatch, queryFulfilled }) {
          await queryFulfilled;
          // we wait to invalidate this tag so the cache refresh has time to start before we refetch
          setTimeout(() => {
            dispatch(
              Api.util.invalidateTags([
                idTag("card", id),
                idTag("persisted-model", id),
                listTag("persisted-info"),
              ]),
            );
          }, PERSISTED_MODEL_REFRESH_DELAY);
        },
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
        async onQueryStarted(id, { dispatch, queryFulfilled }) {
          await queryFulfilled;
          // we wait to invalidate this tag so the cache refresh has time to start before we refetch
          setTimeout(() => {
            dispatch(
              Api.util.invalidateTags([
                idTag("card", id),
                idTag("persisted-model", id),
                listTag("persisted-info"),
              ]),
            );
          }, PERSISTED_MODEL_REFRESH_DELAY);
        },
      }),
      listEmbeddableCards: builder.query<GetEmbeddableCard[], void>({
        query: params => ({
          method: "GET",
          url: "/api/card/embeddable",
          params,
        }),
        providesTags: (result = []) => [
          ...result.map(res => idTag("embed-card", res.id)),
          listTag("embed-card"),
        ],
      }),
      listPublicCards: builder.query<GetPublicCard[], void>({
        query: params => ({
          method: "GET",
          url: "/api/card/public",
          params,
        }),
        providesTags: (result = []) => [
          ...result.map(res => idTag("public-card", res.id)),
          listTag("public-card"),
        ],
      }),
      deleteCardPublicLink: builder.mutation<void, Pick<Card, "id">>({
        query: ({ id }) => ({
          method: "DELETE",
          url: `/api/card/${id}/public_link`,
        }),
        invalidatesTags: (_, error, { id }) =>
          invalidateTags(error, [
            listTag("public-card"),
            idTag("public-card", id),
          ]),
      }),
      createCardPublicLink: builder.mutation<
        {
          uuid: Card["public_uuid"];
        },
        Pick<Card, "id">
      >({
        query: ({ id }) => ({
          method: "POST",
          url: `/api/card/${id}/public_link`,
        }),
        invalidatesTags: (_, error) =>
          invalidateTags(error, [listTag("public-card")]),
      }),
      updateCardEnableEmbedding:
        updateCardPropertyMutation<"enable_embedding">(),
      updateCardEmbeddingParams:
        updateCardPropertyMutation<"embedding_params">(),
    };
  },
});

export const {
  useListCardsQuery,
  useGetCardQuery,
  useGetCardQueryMetadataQuery,
  useGetCardQueryQuery,
  useCreateCardMutation,
  useUpdateCardMutation,
  useDeleteCardMutation,
  useCopyCardMutation,
  useRefreshModelCacheMutation,
  usePersistModelMutation,
  useUnpersistModelMutation,
  useListEmbeddableCardsQuery,
  useListPublicCardsQuery,
  useCreateCardPublicLinkMutation,
  useDeleteCardPublicLinkMutation,
  useUpdateCardEmbeddingParamsMutation,
  useUpdateCardEnableEmbeddingMutation,
  endpoints: {
    createCardPublicLink,
    deleteCardPublicLink,
    updateCardEnableEmbedding,
    updateCardEmbeddingParams,
  },
} = cardApi;

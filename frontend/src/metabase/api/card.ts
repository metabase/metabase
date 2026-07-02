import { PLUGIN_API } from "metabase/plugins";
import { QueryMetadataSchema, QuestionSchema } from "metabase/schema";
import type {
  Card,
  CardId,
  CardQueryMetadata,
  CardQueryRequest,
  CollectionItem,
  CreateCardFromCsvRequest,
  CreateCardRequest,
  DashboardId,
  Dataset,
  FieldValue,
  GetCardRequest,
  GetEmbeddableCard,
  GetPublicCard,
  GetRemappedCardParameterValueRequest,
  ListCardsRequest,
  ParameterId,
  ParameterValues,
  UpdateCardKeyRequest,
  UpdateCardRequest,
} from "metabase-types/api";
import type { EntityToken, EntityUuid } from "metabase-types/api/entity";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideCardListTags,
  provideCardQueryMetadataTags,
  provideCardQueryTags,
  provideCardTags,
  provideParameterValuesTags,
} from "./tags";
import { hydrateMetadataStore } from "./utils/hydrate-metadata-store";

const PERSISTED_MODEL_REFRESH_DELAY = 200;

export type CardParameterValuesRequest = {
  cardId?: CardId | EntityToken;
  entityIdentifier?: EntityUuid | EntityToken | null;
  paramId: ParameterId;
};

export type SearchCardParameterValuesRequest = CardParameterValuesRequest & {
  query: string;
};

export const cardApi = Api.injectEndpoints({
  endpoints: (builder) => {
    const updateCardPropertiesMutation = <
      PropertyKey extends keyof UpdateCardRequest,
    >(
      additionalTags: ReturnType<typeof listTag>[] = [],
    ) =>
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
            ...additionalTags,
          ]),
      });

    return {
      listCards: builder.query<Card[], ListCardsRequest | void>({
        query: (params) => ({
          method: "GET",
          url: "/api/card",
          params,
        }),
        providesTags: (cards = []) => provideCardListTags(cards),
        onQueryStarted: hydrateMetadataStore([QuestionSchema]),
      }),
      getCard: builder.query<Card, GetCardRequest>({
        query: ({ id, ignore_error, ...params }) => ({
          method: "GET",
          url: `/api/card/${id}`,
          params,
          noEvent: ignore_error,
        }),
        providesTags: (card) => (card ? provideCardTags(card) : []),
        onQueryStarted: hydrateMetadataStore(QuestionSchema),
      }),
      getCardQueryMetadata: builder.query<CardQueryMetadata, CardId>({
        query: (id) => ({
          method: "GET",
          url: `/api/card/${id}/query_metadata`,
        }),
        providesTags: (metadata, _error, id) =>
          metadata ? provideCardQueryMetadataTags(id, metadata) : [],
        onQueryStarted: hydrateMetadataStore(QueryMetadataSchema),
      }),
      getCardQuery: builder.query<
        Dataset,
        CardQueryRequest & { _refetchDeps?: unknown }
      >({
        // `_refetchDeps` is part of the RTK cache key (so imperative runners can
        // force a unique key per call) but must not be sent to the server.
        query: ({ cardId, _refetchDeps, ...body }) => ({
          method: "POST",
          url: `/api/card/${cardId}/query`,
          body,
        }),
        providesTags: (_data, _error, { cardId }) =>
          provideCardQueryTags(cardId),
      }),
      getCardQueryPivot: builder.query<
        Dataset,
        CardQueryRequest & { _refetchDeps?: unknown }
      >({
        query: ({ cardId, _refetchDeps, ...body }) => ({
          method: "POST",
          url: `/api/card/pivot/${cardId}/query`,
          body,
        }),
        providesTags: (_data, _error, { cardId }) =>
          provideCardQueryTags(cardId),
      }),
      getCardParameterValues: builder.query<
        ParameterValues,
        CardParameterValuesRequest
      >({
        query: (params) => ({
          method: "GET",
          url: "/api/card/:cardId/params/:paramId/values",
          params,
        }),
        providesTags: (_response, _error, { paramId }) =>
          provideParameterValuesTags(paramId),
      }),
      searchCardParameterValues: builder.query<
        ParameterValues,
        SearchCardParameterValuesRequest
      >({
        query: (params) => ({
          method: "GET",
          url: "/api/card/:cardId/params/:paramId/search/:query",
          params,
        }),
        providesTags: (_response, _error, { paramId }) =>
          provideParameterValuesTags(paramId),
      }),
      getRemappedCardParameterValue: builder.query<
        FieldValue,
        GetRemappedCardParameterValueRequest
      >({
        query: ({ card_id, parameter_id, ...params }) => ({
          method: "GET",
          url: PLUGIN_API.getRemappedCardParameterValueUrl(
            card_id,
            parameter_id,
          ),
          params,
        }),
        providesTags: (_response, _error, { parameter_id }) =>
          provideParameterValuesTags(parameter_id),
      }),
      createCard: builder.mutation<Card, CreateCardRequest>({
        query: (body) => ({
          method: "POST",
          url: "/api/card",
          body,
        }),
        invalidatesTags: (_, error) => invalidateTags(error, [listTag("card")]),
        onQueryStarted: hydrateMetadataStore(QuestionSchema),
      }),
      createCardFromCsv: builder.mutation<Card, CreateCardFromCsvRequest>({
        query: ({ file, collection_id }) => {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("collection_id", String(collection_id));

          return {
            method: "POST",
            url: "/api/upload/csv",
            body: formData,
          };
        },
        invalidatesTags: (_, error) =>
          invalidateTags(error, [
            listTag("card"),
            listTag("schema"),
            listTag("table"),
            listTag("embedding-hub-checklist"),
          ]),
      }),
      updateCard: builder.mutation<Card, UpdateCardRequest>({
        query: ({ id, delete_old_dashcards, ...body }) => ({
          method: "PUT",
          url:
            `/api/card/${id}` +
            (delete_old_dashcards !== undefined
              ? `?delete_old_dashcards=${delete_old_dashcards}`
              : ""),
          body,
        }),
        invalidatesTags: (_, error, payload) => {
          const tags = [
            listTag("card"),
            idTag("card", payload.id),
            idTag("table", `card__${payload.id}`),
            listTag("revision"),
            listTag("table"), // table listings include information about published models
          ];

          if (payload.dashboard_id != null) {
            tags.push(idTag("dashboard", payload.dashboard_id));
          }

          if (payload.collection_id != null) {
            tags.push(idTag("collection", payload.collection_id));
          }

          return invalidateTags(error, tags);
        },
        onQueryStarted: hydrateMetadataStore(QuestionSchema),
      }),
      deleteCard: builder.mutation<void, CardId>({
        query: (id) => ({
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
        query: (id) => ({
          method: "POST",
          url: `/api/card/${id}/copy`,
        }),
        invalidatesTags: (_, error) => invalidateTags(error, [listTag("card")]),
      }),
      persistModel: builder.mutation<void, CardId>({
        query: (id) => ({
          method: "POST",
          url: `/api/persist/card/${id}/persist`,
        }),
        onQueryStarted: async (id, { dispatch, queryFulfilled }) => {
          try {
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
          } catch {
            // mutation failed — nothing to invalidate
          }
        },
      }),
      unpersistModel: builder.mutation<void, CardId>({
        query: (id) => ({
          method: "POST",
          url: `/api/persist/card/${id}/unpersist`,
        }),
        invalidatesTags: (_, error, id) =>
          invalidateTags(error, [
            idTag("card", id),
            idTag("persisted-model", id),
            listTag("persisted-info"),
          ]),
      }),
      refreshModelCache: builder.mutation<void, CardId>({
        query: (id) => ({
          method: "POST",
          url: `/api/persist/card/${id}/refresh`,
        }),
        onQueryStarted: async (id, { dispatch, queryFulfilled }) => {
          try {
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
          } catch {
            // mutation failed — nothing to invalidate
          }
        },
      }),
      listEmbeddableCards: builder.query<GetEmbeddableCard[], void>({
        query: (params) => ({
          method: "GET",
          url: "/api/card/embeddable",
          params,
        }),
        providesTags: (result = []) => [
          ...result.map((res) => idTag("embed-card", res.id)),
          listTag("embed-card"),
        ],
      }),
      listPublicCards: builder.query<GetPublicCard[], void>({
        query: (params) => ({
          method: "GET",
          url: "/api/card/public",
          params,
        }),
        providesTags: (result = []) => [
          ...result.map((res) => idTag("public-card", res.id)),
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
      updateCardEnableEmbedding: updateCardPropertiesMutation<
        "enable_embedding" | "embedding_type"
      >([listTag("embedding-hub-checklist")]),
      updateCardEmbeddingParams: updateCardPropertiesMutation<
        "embedding_params" | "embedding_type"
      >(),
      getCardDashboards: builder.query<
        { id: DashboardId; name: string; enable_embedding: boolean }[],
        Pick<Card, "id">
      >({
        query: ({ id }) => ({
          method: "GET",
          url: `/api/card/${id}/dashboards`,
        }),
        forceRefetch: () => true,
      }),
      getMultipleCardsDashboards: builder.query<
        {
          card_id: CollectionItem["id"];
          dashboards: { id: DashboardId; name: string; error?: string }[];
        }[],
        { card_ids: CollectionItem["id"][] }
      >({
        query: (body) => ({
          method: "POST",
          url: `/api/cards/dashboards`,
          body,
        }),
        forceRefetch: () => true,
      }),
    };
  },
});

export const {
  useListCardsQuery,
  useGetCardQuery,
  useLazyGetCardQuery,
  useGetCardQueryMetadataQuery,
  useGetCardQueryQuery,
  useLazyGetCardQueryQuery,
  useGetCardQueryPivotQuery,
  useLazyGetCardQueryPivotQuery,
  useGetCardParameterValuesQuery,
  useSearchCardParameterValuesQuery,
  useGetRemappedCardParameterValueQuery,
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
  useGetCardDashboardsQuery,
  useGetMultipleCardsDashboardsQuery,
  endpoints: {
    createCardPublicLink,
    deleteCardPublicLink,
    updateCardEnableEmbedding,
    updateCardEmbeddingParams,
    getCardDashboards,
  },
} = cardApi;

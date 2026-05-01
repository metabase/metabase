import {
  CollectionSchema,
  ObjectUnionSchema,
  SnippetCollectionSchema,
} from "metabase/schema";
import type {
  Collection,
  CreateCollectionRequest,
  DeleteCollectionRequest,
  GetCollectionDashboardQuestionCandidatesRequest,
  GetCollectionDashboardQuestionCandidatesResult,
  ListCollectionItemsRequest,
  ListCollectionItemsResponse,
  ListCollectionsRequest,
  ListCollectionsTreeRequest,
  MoveCollectionDashboardCandidatesRequest,
  MoveCollectionDashboardCandidatesResult,
  UpdateCollectionRequest,
  getCollectionRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideCollectionItemListTags,
  provideCollectionListTags,
  provideCollectionTags,
} from "./tags";
import { hydrateLegacyEntities } from "./utils/hydrate-legacy-entities";

const flattenCollectionTree = (tree: Collection[]): Collection[] =>
  tree.flatMap((collection) => [
    collection,
    ...flattenCollectionTree(collection.children ?? []),
  ]);

// Snippet collections live in their own entity slice (`snippetCollections`),
// so hydrating them through `CollectionSchema` would clobber regular
// collections. Hydrate through the matching schema instead.
const collectionSchemaForRequest = (
  request: { namespace?: string | null } | void,
) =>
  request?.namespace === "snippets"
    ? SnippetCollectionSchema
    : CollectionSchema;

export const collectionApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * @deprecated This endpoint is extremely slow on large instances, it should not be used
     * you probably only need a few collections, just fetch those
     */
    listCollections: builder.query<Collection[], ListCollectionsRequest | void>(
      {
        query: (params) => ({
          method: "GET",
          url: `/api/collection`,
          params,
        }),
        providesTags: (collections = []) =>
          provideCollectionListTags(collections),
        onQueryStarted: (request, lifecycle) =>
          hydrateLegacyEntities([collectionSchemaForRequest(request)])(
            request,
            lifecycle,
          ),
      },
    ),
    listCollectionsTree: builder.query<
      Collection[],
      ListCollectionsTreeRequest | void
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/collection/tree",
        params,
      }),
      providesTags: (collections = []) => [
        ...provideCollectionListTags(collections),
        "collection-tree",
      ],
      onQueryStarted: (request, lifecycle) =>
        hydrateLegacyEntities<Collection[]>(
          [collectionSchemaForRequest(request)],
          flattenCollectionTree,
        )(request, lifecycle),
    }),
    listCollectionItems: builder.query<
      ListCollectionItemsResponse,
      ListCollectionItemsRequest
    >({
      query: ({ id, ...params }) => ({
        method: "GET",
        url: `/api/collection/${id}/items`,
        params,
      }),
      providesTags: (response, error, { models, id }) => [
        ...provideCollectionItemListTags(response?.data ?? [], models),
        { type: "collection", id: `${id}-items` },
      ],
      onQueryStarted: hydrateLegacyEntities<ListCollectionItemsResponse>(
        [ObjectUnionSchema],
        (response) => response.data,
      ),
    }),
    getCollection: builder.query<Collection, getCollectionRequest>({
      query: ({ id, ignore_error, ...params }) => {
        return {
          method: "GET",
          url: `/api/collection/${id}`,
          params,
          noEvent: ignore_error,
        };
      },
      providesTags: (collection) =>
        collection ? provideCollectionTags(collection) : [],
      onQueryStarted: (request, lifecycle) =>
        hydrateLegacyEntities(collectionSchemaForRequest(request))(
          request,
          lifecycle,
        ),
    }),
    createCollection: builder.mutation<Collection, CreateCollectionRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/collection",
        body,
      }),
      invalidatesTags: (collection, error, request) => {
        if (!collection) {
          return [];
        }

        const tags = [
          listTag("collection"),
          idTag("collection", collection.parent_id ?? "root"),
        ];

        // Creating a shared tenant collection affects the embedding hub checklist
        if (request.namespace === "shared-tenant-collection") {
          tags.push(listTag("embedding-hub-checklist"));
        }

        return invalidateTags(error, tags);
      },
    }),
    updateCollection: builder.mutation<Collection, UpdateCollectionRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/collection/${id}`,
        body,
      }),
      invalidatesTags: (_, error, payload) => {
        const tags = [
          listTag("collection"),
          idTag("collection", payload.id),
          idTag("collection", payload.parent_id ?? "root"),
        ];

        // When archiving/restoring a collection, invalidate bookmarks
        // since items within the collection may be bookmarked
        if ("archived" in payload) {
          tags.push(listTag("bookmark"));
        }

        return invalidateTags(error, tags);
      },
    }),
    deleteCollection: builder.mutation<void, DeleteCollectionRequest>({
      query: ({ id, ...body }) => ({
        method: "DELETE",
        url: `/api/collection/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("collection"), idTag("collection", id)]),
    }),
    listCollectionDashboardQuestionCandidates: builder.query<
      GetCollectionDashboardQuestionCandidatesResult,
      GetCollectionDashboardQuestionCandidatesRequest
    >({
      query: ({ collectionId, ...params }) => ({
        method: "GET",
        url: `/api/collection/${collectionId}/dashboard-question-candidates`,
        params,
      }),
      providesTags: (_, __, { collectionId }) => [
        idTag("dashboard-question-candidates", collectionId),
        idTag("collection", collectionId),
        // HACK: instead of making all dashboard operations aware of dq candidates
        // rely on the fact that all dashboard mutation operation invalidate the
        // dashboard list cache tag
        listTag("dashboard"),
      ],
    }),
    moveCollectionDashboardQuestionCandidates: builder.mutation<
      MoveCollectionDashboardCandidatesResult,
      MoveCollectionDashboardCandidatesRequest
    >({
      query: ({ collectionId, cardIds }) => ({
        method: "POST",
        url: `/api/collection/${collectionId}/move-dashboard-question-candidates`,
        body: { card_ids: cardIds },
      }),
      invalidatesTags: (result, error, { collectionId }) =>
        invalidateTags(error, [
          idTag("dashboard-question-candidates", collectionId),
          idTag("collection", collectionId),
          listTag("card"),
          ...(result ? result.moved.map((id) => idTag("card", id)) : []),
        ]),
    }),
  }),
});

export const {
  useListCollectionsQuery,
  useListCollectionsTreeQuery,
  useListCollectionItemsQuery,
  useGetCollectionQuery,
  useCreateCollectionMutation,
  useUpdateCollectionMutation,
  useDeleteCollectionMutation,
  useListCollectionDashboardQuestionCandidatesQuery,
  useMoveCollectionDashboardQuestionCandidatesMutation,
} = collectionApi;

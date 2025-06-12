import type {
  DeleteSuggestedMetabotPromptRequest,
  MetabotAgentRequest,
  MetabotAgentResponse,
  MetabotApiEntity,
  MetabotEntity,
  MetabotId,
  MetabotInfo,
  PaginationRequest,
  PaginationResponse,
  SuggestedMetabotPromptsRequest,
  SuggestedMetabotPromptsResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag } from "./tags";

export const metabotApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    metabotAgent: builder.mutation<MetabotAgentResponse, MetabotAgentRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/metabot-v3/v2/agent",
        body,
      }),
    }),
    listMetabots: builder.query<{ items: MetabotInfo[] }, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/metabot-v3/metabot",
      }),
    }),
    listMetabotsEntities: builder.query<
      { items: MetabotEntity[] } & PaginationResponse,
      { id: MetabotId } & PaginationRequest
    >({
      query: ({ id, ...paginationProps }) => ({
        method: "GET",
        url: `/api/ee/metabot-v3/metabot/${id}/entities`,
        body: paginationProps,
      }),
      providesTags: ["metabot-entities-list"],
      transformResponse: (
        response: { items: MetabotApiEntity[] } & PaginationResponse,
      ) => ({
        ...response,
        // transform model_id to id in items
        items: response.items.map(({ model_id: id, ...item }) => ({
          ...item,
          id,
        })),
      }),
    }),
    updateMetabotEntities: builder.mutation<
      void,
      {
        id: MetabotId;
        entities: Pick<MetabotEntity, "model" | "id">[];
      }
    >({
      query: ({ id, entities }) => ({
        method: "PUT",
        url: `/api/ee/metabot-v3/metabot/${id}/entities`,
        body: { items: entities },
      }),
      invalidatesTags: (_, error, { id }) =>
        !error
          ? ["metabot-entities-list", idTag("metabot-prompt-suggestions", id)]
          : [],
    }),
    deleteMetabotEntities: builder.mutation<
      void,
      {
        metabotId: MetabotId;
        entityModel: MetabotEntity["model"];
        entityId: MetabotEntity["id"];
      }
    >({
      query: ({ metabotId, entityModel, entityId }) => ({
        method: "DELETE",
        url: `/api/ee/metabot-v3/metabot/${metabotId}/entities/${entityModel}/${entityId}`,
      }),
      invalidatesTags: (_, error, { metabotId }) =>
        !error
          ? [
              "metabot-entities-list",
              idTag("metabot-prompt-suggestions", metabotId),
            ]
          : [],
    }),
    getSuggestedMetabotPrompts: builder.query<
      SuggestedMetabotPromptsResponse,
      SuggestedMetabotPromptsRequest
    >({
      query: ({ metabot_id, ...params }) => ({
        method: "GET",
        url: `/api/ee/metabot-v3/metabot/${metabot_id}/prompt-suggestions`,
        params,
      }),
      providesTags: (_, __, { metabot_id }) => [
        idTag("metabot-prompt-suggestions", metabot_id),
      ],
    }),
    deleteSuggestedMetabotPrompt: builder.mutation<
      void,
      DeleteSuggestedMetabotPromptRequest
    >({
      query: ({ metabot_id, prompt_id }) => ({
        method: "DELETE",
        url: `/api/ee/metabot-v3/metabot/${metabot_id}/prompt-suggestions/${prompt_id}`,
      }),
      invalidatesTags: (_, error, { metabot_id }) =>
        !error ? [idTag("metabot-prompt-suggestions", metabot_id)] : [],
    }),
    regenerateSuggestedMetabotPrompts: builder.mutation<void, MetabotId>({
      query: (metabot_id) => ({
        method: "POST",
        url: `/api/ee/metabot-v3/metabot/${metabot_id}/prompt-suggestions/regenerate`,
      }),
      invalidatesTags: (_, error, metabot_id) =>
        !error ? [idTag("metabot-prompt-suggestions", metabot_id)] : [],
    }),
  }),
});

export const { metabotAgent } = metabotApi.endpoints;
export const {
  useMetabotAgentMutation,
  useListMetabotsQuery,
  useListMetabotsEntitiesQuery,
  useUpdateMetabotEntitiesMutation,
  useDeleteMetabotEntitiesMutation,
  useGetSuggestedMetabotPromptsQuery,
  useDeleteSuggestedMetabotPromptMutation,
  useRegenerateSuggestedMetabotPromptsMutation,
} = metabotApi;

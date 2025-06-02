import _ from "underscore";

import type {
  MetabotAgentRequest,
  MetabotAgentResponse,
  MetabotApiEntity,
  MetabotEntity,
  MetabotId,
  MetabotInfo,
  MetabotPromptSuggestions,
  PaginationRequest,
  PaginationResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

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
      ) => {
        // transform model_id to id in items
        return {
          ...response,
          items: response.items.map((item) => ({
            ..._.omit(item, "model_id"),
            id: item.model_id,
          })),
        };
      },
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
      invalidatesTags: ["metabot-entities-list"],
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
      invalidatesTags: ["metabot-entities-list"],
    }),
    getSuggestedMetabotPrompts: builder.query<MetabotPromptSuggestions, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/metabot-v3/v2/prompt-suggestions",
      }),
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
} = metabotApi;

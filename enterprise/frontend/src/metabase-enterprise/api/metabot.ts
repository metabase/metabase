import _ from "underscore";

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
  SuggestedMetabotPrompt,
  SuggestedMetabotPromptsRequest,
  SuggestedMetabotPromptsResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag } from "./tags";

let fakeSuggestedPrompts: Record<MetabotId, SuggestedMetabotPrompt[]> = {
  "1": [
    {
      id: 1,
      metabot_id: 1,
      prompt: "What is the total revenue for this quarter?",
      model: "metric",
      model_id: 1,
      created_at: "2025-05-15T10:30:00Z",
      updated_at: "2025-05-15T10:30:00Z",
    },
    {
      id: 2,
      metabot_id: 1,
      prompt: "Show me the customer acquisition trends over the last 6 months",
      model: "model",
      model_id: 2,
      created_at: "2025-05-15T11:15:00Z",
      updated_at: "2025-05-15T11:15:00Z",
    },
    {
      id: 3,
      metabot_id: 1,
      prompt: "What are our top performing products by sales volume?",
      model: "metric",
      model_id: 3,
      created_at: "2025-05-15T14:22:00Z",
      updated_at: "2025-05-16T09:45:00Z",
    },
    {
      id: 4,
      metabot_id: 1,
      prompt: "How has our monthly recurring revenue changed this year?",
      model: "model",
      model_id: 1,
      created_at: "2025-05-16T08:30:00Z",
      updated_at: "2025-05-16T08:30:00Z",
    },
    {
      id: 5,
      metabot_id: 1,
      prompt: "What is our customer churn rate compared to last quarter?",
      model: "metric",
      model_id: 2,
      created_at: "2025-05-16T13:10:00Z",
      updated_at: "2025-05-16T13:10:00Z",
    },
    {
      id: 6,
      metabot_id: 1,
      prompt: "Show me the geographic distribution of our user base",
      model: "model",
      model_id: 4,
      created_at: "2025-05-17T16:45:00Z",
      updated_at: "2025-05-18T10:20:00Z",
    },
    {
      id: 7,
      metabot_id: 1,
      prompt: "What is the average order value for new customers?",
      model: "metric",
      model_id: 4,
      created_at: "2025-05-18T09:15:00Z",
      updated_at: "2025-05-18T09:15:00Z",
    },
    {
      id: 8,
      metabot_id: 1,
      prompt: "How do our conversion rates vary by traffic source?",
      model: "model",
      model_id: 3,
      created_at: "2025-05-18T15:30:00Z",
      updated_at: "2025-05-18T15:30:00Z",
    },
  ],
  "2": [],
};

const fakeSuggestedPromptsCopy = structuredClone(fakeSuggestedPrompts);

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
      // query: ({ metabot_id, ...params }) => ({
      //   method: "GET",
      //   url: `/api/ee/metabot-v3/metabot/${metabot_id}/prompt-suggestions`,
      //   params,
      // }),
      queryFn: async ({ metabot_id, sample, offset, limit }) => {
        const suggestions = fakeSuggestedPrompts[metabot_id];
        const sortedSuggestions = sample ? _.shuffle(suggestions) : suggestions;
        const paginatedSuggestions = sortedSuggestions.slice(
          offset ?? 0,
          (offset ?? 0) + (limit ?? 50),
        );

        await new Promise((res) => setTimeout(res, Math.random() * 1000));

        return {
          data: {
            prompts: paginatedSuggestions,
            total: suggestions.length,
            limit: limit ?? null,
            offset: offset ?? null,
          },
        };
      },
      providesTags: (_, __, { metabot_id }) => [
        idTag("metabot-prompt-suggestions", metabot_id),
      ],
    }),
    deleteSuggestedMetabotPrompt: builder.mutation<
      void,
      DeleteSuggestedMetabotPromptRequest
    >({
      // query: ({ metabot_id, prompt_id }) => ({
      //   method: "DELETE",
      //   url: `/api/ee/metabot-v3/metabot/${metabot_id}/prompt-suggestions/${prompt_id}`,
      // }),
      queryFn: async ({ metabot_id, prompt_id }) => {
        fakeSuggestedPrompts[metabot_id] = fakeSuggestedPrompts[
          metabot_id
        ].filter((s) => s.id !== prompt_id);
        return { data: {} as any };
      },
      invalidatesTags: (_, error, { metabot_id }) =>
        !error ? [idTag("metabot-prompt-suggestions", metabot_id)] : [],
    }),
    refreshSuggestedMetabotPrompts: builder.mutation<void, MetabotId>({
      // query: (metabot_id) => ({
      //   method: "DELETE",
      //   url: `/api/ee/metabot-v3/metabot/${metabot_id}/prompt-suggestions`,
      // }),
      queryFn: async () => {
        fakeSuggestedPrompts = structuredClone(fakeSuggestedPromptsCopy);
        await new Promise((res) =>
          setTimeout(res, Math.random() * 2000 + 3000),
        );
        return { data: {} as any };
      },
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
  useRefreshSuggestedMetabotPromptsMutation,
} = metabotApi;

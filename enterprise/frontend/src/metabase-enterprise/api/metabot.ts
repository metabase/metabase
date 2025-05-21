import _ from "underscore";

import type {
  MetabotAgentRequest,
  MetabotAgentResponse,
  MetabotApiEntity,
  MetabotEntity,
  MetabotId,
  MetabotInfo,
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
        url: "/api/ee/metabot-v3/metabots",
      }),
      providesTags: ["metabots-list"],
    }),
    listMetabotsEntities: builder.query<
      { items: MetabotEntity[] } & PaginationResponse,
      MetabotId
    >({
      query: (id: number) => ({
        method: "GET",
        url: `/api/ee/metabot-v3/metabots/${id}/entities`,
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
        url: `/api/ee/metabot-v3/metabots/${id}/entities`,
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
        url: `/api/ee/metabot-v3/metabots/${metabotId}/entities/${entityModel}/${entityId}`,
      }),
      invalidatesTags: ["metabot-entities-list"],
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
} = metabotApi;

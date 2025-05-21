import _ from "underscore";

import type {
  MetabotAgentRequest,
  MetabotAgentResponse,
  MetabotEntity,
  MetabotId,
  MetabotInfo,
  PaginationResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

// the API returns "model_id" instead of "id", and we transform it here for compatibility
// with existing components that expect "id"
type MetabotEntityApi = Omit<MetabotEntity, "id"> & {
  model_id: MetabotEntity["id"];
};

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
        response: { items: MetabotEntityApi[] } & PaginationResponse,
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
    addMetabotEntities: builder.mutation<
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
  useAddMetabotEntitiesMutation,
  useDeleteMetabotEntitiesMutation,
} = metabotApi;

import type {
  MetabotAgentRequest,
  MetabotAgentResponse,
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
    listMetabots: builder.query<MetabotInfo[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/metabot-v3/metabots",
      }),
      providesTags: ["metabots-list"],
    }),
    listMetabotsEntities: builder.query<
      { data: MetabotEntity[] & PaginationResponse },
      MetabotId
    >({
      query: (id: number) => ({
        method: "GET",
        url: `/api/ee/metabot-v3/metabots/${id}/entities`,
      }),
      providesTags: ["metabot-entities-list"],
    }),
    addMetabotEntities: builder.mutation<
      void,
      {
        id: MetabotId;
        entities: {
          model_id: MetabotEntity["id"];
          model_type: MetabotEntity["model"];
        }[];
      }
    >({
      query: ({ id, entities }) => ({
        method: "PUT",
        url: `/api/ee/metabot-v3/metabots/${id}/entities`,
        body: entities,
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

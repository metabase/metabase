import { type BaseEntityId, isNanoID } from "metabase-types/api/entity-id";

import { Api } from "./api";

const validEntityTypes = [
  "action",
  "card",
  "collection",
  "dashboard",
  "dashboard-card",
  "dashboard-tab",
  "dataset",
  "dimension",
  "metric",
  "permissions-group",
  "pulse",
  "pulse-card",
  "pulse-channel",
  "segment",
  "snippet",
  "timeline",
  "user",
] as const;

export type EntityType = typeof validEntityTypes[number];

type TranslateEntityIdRequest = Partial<Record<EntityType, BaseEntityId[]>>;

export type TranslateEntityIdResponseSuccess = {
  status: "success";
  id: string | number;
  type: EntityType;
};

export type TranslateEntityIdResponseNotFound = {
  status: "not-found";
  type: EntityType;
  id: null;
};

export type TranslateEntityIdResponse = Record<
  BaseEntityId,
  TranslateEntityIdResponseSuccess | TranslateEntityIdResponseNotFound
>;

type TranslateEntityIdError = {
  message: string;
  explanation: Record<EntityType, [[string]]>;
};

const entityIdApi = Api.injectEndpoints({
  endpoints: builder => ({
    translateEntityId: builder.query<
      TranslateEntityIdResponse,
      TranslateEntityIdRequest
    >({
      query: (requestEntities: TranslateEntityIdRequest) => {
        Object.values(requestEntities)
          .flat()
          .forEach(entityId => {
            if (isNanoID(entityId)) {
              throw new Error(`Entity ID ${entityId} must be a NanoID`);
            }
          });

        return {
          method: "POST",
          url: `/api/util/entity_id`,
          body: {
            entity_ids: requestEntities,
          },
        };
      },
      transformResponse: (response: {
        entity_ids: TranslateEntityIdResponse;
      }) => response.entity_ids,
      transformErrorResponse: (response: TranslateEntityIdError) => ({
        message: response.message,
        explanation: response.explanation,
      }),
    }),
  }),
});

export const { useTranslateEntityIdQuery } = entityIdApi;

import {
  type BaseEntityId,
  isBaseEntityID,
} from "metabase-types/api/entity-id";

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
      queryFn: async (requestEntities, queryApi, extraOptions, baseQuery) => {
        for (const entityId of Object.values(requestEntities).flat()) {
          if (!isBaseEntityID(entityId)) {
            return {
              error: {
                message: "Invalid input",
                explanation: `${entityId} is not a valid Entity ID`,
              },
            };
          }
        }

        return baseQuery({
          method: "POST",
          url: `/api/util/entity_id`,
          body: {
            entity_ids: requestEntities,
          },
        });
      },
      // the error object has a bunch of other keys we don't want, so we pick those out
      transformErrorResponse: (response: TranslateEntityIdError) => ({
        message: response.message,
        explanation: response.explanation,
      }),
    }),
  }),
});
export const { useTranslateEntityIdQuery } = entityIdApi;

import type { BaseEntityId } from "metabase-types/api";

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
];

export type EntityType = typeof validEntityTypes[number];

type TranslateEntityIdRequest = Record<EntityType, string[]>;

export type TranslateEntityIdResponseSuccess = {
  status: "success";
  id: string;
  type: string;
};

export type TranslateEntityIdResponseNotFound = {
  status: "not-found";
  type: string;
};

export type TranslateEntityIdResponse = Record<
  BaseEntityId,
  TranslateEntityIdResponseSuccess | TranslateEntityIdResponseNotFound
>;

type TranslateEntityIdError = {
  message: string;
  explanation: Record<keyof typeof validEntityTypes, [[string]]>;
};

export const entityIdApi = Api.injectEndpoints({
  endpoints: builder => ({
    translateEntityId: builder.query<
      TranslateEntityIdResponse,
      TranslateEntityIdRequest
    >({
      query: (requestEntities: TranslateEntityIdRequest) => ({
        method: "POST",
        url: `/api/util/entity_id`,
        body: {
          entity_ids: requestEntities,
        },
      }),
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

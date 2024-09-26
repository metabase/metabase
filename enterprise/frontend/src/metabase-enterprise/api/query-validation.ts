import type {
  InvalidCardRequest,
  InvalidCardResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const queryValidationAPI = EnterpriseApi.injectEndpoints({
  endpoints: builder => ({
    getInvalidCards: builder.query<InvalidCardResponse, InvalidCardRequest>({
      query: params => ({
        method: "GET",
        url: "/api/ee/query-reference-validation/invalid-cards",
        params,
      }),
    }),
  }),
});

export const { useGetInvalidCardsQuery } = queryValidationAPI;

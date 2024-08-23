import { Api } from "metabase/api";
import type {
  InvalidCardRequest,
  InvalidCardResponse,
} from "metabase-types/api";

export const queryValidationAPI = Api.injectEndpoints({
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

import { Api } from "metabase/api";
import type {
  Card,
  CollectionId,
  PaginationRequest,
  PaginationResponse,
} from "metabase-types/api";

export type CardError = {
  field: string;
  table: string;
  type: "inactive-field" | "inactive-table" | "unknown-field" | "unknown-table";
};
export type invalidCardResponse = {
  data: (Card & { errors: CardError[] })[];
} & PaginationResponse;

export type invalidCardRequest = {
  sort_direction?: "asc" | "desc";
  sort_column?: string;
  collection_id?: CollectionId | null;
} & PaginationRequest;

export const queryValidationAPI = Api.injectEndpoints({
  endpoints: builder => ({
    getInvalidCards: builder.query<invalidCardResponse, invalidCardRequest>({
      query: params => ({
        method: "GET",
        url: "/api/ee/query-reference-validation/invalid-cards",
        params,
      }),
    }),
  }),
});

export const { useGetInvalidCardsQuery } = queryValidationAPI;

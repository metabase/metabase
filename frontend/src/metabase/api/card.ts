import type {
  Card,
  GetCardRequest,
  ListCardsRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, listTag } from "./tags";

export const cardApi = Api.injectEndpoints({
  endpoints: builder => ({
    listCards: builder.query<Card[], ListCardsRequest | void>({
      query: body => ({
        method: "GET",
        url: "/api/card",
        body,
      }),
      providesTags: response => [
        listTag("card"),
        ...(response?.map(({ id }) => idTag("card", id)) ?? []),
      ],
    }),
    getCard: builder.query<Card, GetCardRequest>({
      query: ({ id, ...body }) => ({
        method: "GET",
        url: `/api/card/${id}`,
        body,
      }),
      providesTags: (card, error, { id }) => [idTag("card", id)],
    }),
  }),
});

export const { useListCardsQuery } = cardApi;

import type {
  Card,
  CardId,
  CreateCardRequest,
  GetCardRequest,
  ListCardsRequest,
  UpdateCardRequest,
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
    createCard: builder.mutation<Card, CreateCardRequest>({
      query: body => ({
        method: "POST",
        url: "/api/card",
        body,
      }),
      invalidatesTags: [listTag("card")],
    }),
    updateCard: builder.mutation<Card, UpdateCardRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/card/${id}`,
        body,
      }),
      invalidatesTags: (card, error, { id }) => [
        listTag("card"),
        idTag("card", id),
        idTag("table", `card__${id}`),
      ],
    }),
    deleteCard: builder.mutation<void, CardId>({
      query: id => ({
        method: "DELETE",
        url: `/api/card/${id}`,
      }),
      invalidatesTags: (response, error, id) => [
        listTag("card"),
        idTag("card", id),
        idTag("table", `card__${id}`),
      ],
    }),
    copyCard: builder.mutation<Card, CardId>({
      query: id => ({
        method: "POST",
        url: `/api/card/${id}/copy`,
      }),
      invalidatesTags: [listTag("card")],
    }),
  }),
});

export const {
  useListCardsQuery,
  useGetCardQuery,
  useCreateCardMutation,
  useUpdateCardMutation,
  useDeleteCardMutation,
  useCopyCardMutation,
} = cardApi;

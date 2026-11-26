import type {
  PublicLinkEntity,
  PublicLinkRefusalResponse,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, listTag } from "./tags";

export const publicLinkApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getPublicLinkRefusal: builder.query<
      PublicLinkRefusalResponse,
      PublicLinkEntity
    >({
      query: ({ model, id }) => ({
        method: "GET",
        url: `/api/public-link-refusal/${model}/${id}`,
      }),
      // depends on the cards reached and each database's anonymous-access grant
      providesTags: (_response, _error, { model, id }) => [
        idTag(model, id),
        listTag("card"),
        listTag("database"),
      ],
    }),
  }),
});

export const { useGetPublicLinkRefusalQuery } = publicLinkApi;

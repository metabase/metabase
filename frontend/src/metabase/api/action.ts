import type { GetActionRequest, WritebackAction } from "metabase-types/api";

//
import { Api } from "./api";
import { idTag } from "./tags";

export const actionApi = Api.injectEndpoints({
  endpoints: builder => ({
    getAction: builder.query<WritebackAction, GetActionRequest>({
      query: ({ id }) => ({
        method: "GET",
        url: `/api/action/${id}`,
      }),
      providesTags: action => (action ? [idTag("action", action.id)] : []),
    }),
  }),
});

export const { useGetActionQuery } = actionApi;

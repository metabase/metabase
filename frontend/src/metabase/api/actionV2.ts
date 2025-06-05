import type { ActionV2ListModelsResponse } from "metabase-types/api";

import { Api } from "./api";

export const actionV2Api = Api.injectEndpoints({
  endpoints: (builder) => ({
    listModels: builder.query<ActionV2ListModelsResponse, void>({
      query: (params) => ({
        method: "GET",
        url: `/api/action/v2/model`,
        params,
      }),
      // providesTags: (models = []) => provideCardListTags(models), // TODO: add caching
    }),
  }),
});

export const { useListModelsQuery } = actionV2Api;

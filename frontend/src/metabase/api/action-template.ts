import type { ActionTemplateCategory } from "metabase-types/api";

import { Api } from "./api";

export const actionTemplateApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listActionTemplateCategories: builder.query<ActionTemplateCategory[], void>(
      {
        query: () => ({
          method: "GET",
          url: "/api/action-template",
        }),
      },
    ),
  }),
});

export const { useListActionTemplateCategoriesQuery } = actionTemplateApi;

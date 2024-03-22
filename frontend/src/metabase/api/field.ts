import type {
  FieldId,
  FieldSearchInput,
  FieldValue,
  FieldValuesResponse,
} from "metabase-types/api";

import { Api } from "./api";

export const fieldApi = Api.injectEndpoints({
  endpoints: builder => ({
    getFieldValues: builder.query<FieldValuesResponse, FieldId>({
      query: id => ({
        method: "GET",
        url: `/api/field/${id}/values`,
      }),
    }),
    searchFieldValues: builder.query<FieldValue[], FieldSearchInput>({
      query: ({ fieldId, searchFieldId, ...body }) => ({
        method: "GET",
        url: `/api/field/${fieldId}/search/${searchFieldId}`,
        body,
      }),
    }),
  }),
});

export const { useGetFieldValuesQuery, useSearchFieldValuesQuery } = fieldApi;

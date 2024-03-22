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
      query: fieldId => ({
        method: "GET",
        url: `/api/field/${fieldId}/values`,
      }),
    }),
    searchFieldValues: builder.query<FieldValue[], FieldSearchInput>({
      query: ({ fieldId, searchFieldId, ...body }) => ({
        method: "GET",
        url: `/api/field/${fieldId}/search/${searchFieldId}`,
        body,
      }),
    }),
    rescanFieldValues: builder.mutation<void, FieldId>({
      query: fieldId => ({
        method: "POST",
        url: `/api/field/${fieldId}/rescan_values`,
      }),
    }),
    discardFieldValues: builder.mutation<void, FieldId>({
      query: fieldId => ({
        method: "POST",
        url: `/api/field/${fieldId}/discard_values`,
      }),
    }),
  }),
});

export const { useGetFieldValuesQuery, useSearchFieldValuesQuery } = fieldApi;

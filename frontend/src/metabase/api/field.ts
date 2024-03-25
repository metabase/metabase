import type {
  FieldId,
  FieldSearchInput,
  FieldValue,
  FieldValuesResult,
} from "metabase-types/api";

import { Api } from "./api";
import { FIELD_VALUES_TAG } from "./tags";

export const fieldApi = Api.injectEndpoints({
  endpoints: builder => ({
    getFieldValues: builder.query<FieldValuesResult, FieldId>({
      query: fieldId => ({
        method: "GET",
        url: `/api/field/${fieldId}/values`,
      }),
      providesTags: (result, error, fieldId) => [
        { type: FIELD_VALUES_TAG, id: fieldId },
      ],
    }),
    searchFieldValues: builder.query<FieldValue[], FieldSearchInput>({
      query: ({ fieldId, searchFieldId, ...body }) => ({
        method: "GET",
        url: `/api/field/${fieldId}/search/${searchFieldId}`,
        body,
      }),
      providesTags: (result, error, { fieldId }) => [
        { type: FIELD_VALUES_TAG, id: fieldId },
      ],
    }),
    rescanFieldValues: builder.mutation<void, FieldId>({
      query: fieldId => ({
        method: "POST",
        url: `/api/field/${fieldId}/rescan_values`,
      }),
      invalidatesTags: (result, error, fieldId) => [
        { type: FIELD_VALUES_TAG, id: fieldId },
      ],
    }),
    discardFieldValues: builder.mutation<void, FieldId>({
      query: fieldId => ({
        method: "POST",
        url: `/api/field/${fieldId}/discard_values`,
      }),
      invalidatesTags: (result, error, fieldId) => [
        { type: FIELD_VALUES_TAG, id: fieldId },
      ],
    }),
  }),
});

export const {
  useGetFieldValuesQuery,
  useSearchFieldValuesQuery,
  useRescanFieldValuesMutation,
  useDiscardFieldValuesMutation,
} = fieldApi;

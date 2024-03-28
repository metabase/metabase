import type {
  FieldId,
  SearchFieldValuesRequest,
  FieldValue,
  GetFieldValuesResponse,
  Field,
  GetFieldRequest,
  UpdateFieldRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, tag } from "./tags";

export const fieldApi = Api.injectEndpoints({
  endpoints: builder => ({
    getField: builder.query<Field, GetFieldRequest>({
      query: ({ id, ...body }) => ({
        method: "GET",
        url: `/api/field/${id}`,
        body,
      }),
      providesTags: (response, error, { id }) => [idTag("field", id)],
    }),
    updateField: builder.mutation<Field, UpdateFieldRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/field/${id}`,
        body,
      }),
      invalidatesTags: (response, error, { id }) => [
        idTag("field", id),
        idTag("field-values", id),
        tag("database-metadata"),
        tag("database-id-fields"),
      ],
    }),
    getFieldValues: builder.query<GetFieldValuesResponse, FieldId>({
      query: fieldId => ({
        method: "GET",
        url: `/api/field/${fieldId}/values`,
      }),
      providesTags: (result, error, fieldId) => [
        idTag("field-values", fieldId),
      ],
    }),
    searchFieldValues: builder.query<FieldValue[], SearchFieldValuesRequest>({
      query: ({ fieldId, searchFieldId, ...body }) => ({
        method: "GET",
        url: `/api/field/${fieldId}/search/${searchFieldId}`,
        body,
      }),
      providesTags: (result, error, { fieldId }) => [
        idTag("field-values", fieldId),
      ],
    }),
    rescanFieldValues: builder.mutation<void, FieldId>({
      query: fieldId => ({
        method: "POST",
        url: `/api/field/${fieldId}/rescan_values`,
      }),
      invalidatesTags: (result, error, fieldId) => [
        idTag("field-values", fieldId),
      ],
    }),
    discardFieldValues: builder.mutation<void, FieldId>({
      query: fieldId => ({
        method: "POST",
        url: `/api/field/${fieldId}/discard_values`,
      }),
      invalidatesTags: (result, error, fieldId) => [
        idTag("field-values", fieldId),
      ],
    }),
  }),
});

export const {
  useGetFieldQuery,
  useUpdateFieldMutation,
  useGetFieldValuesQuery,
  useSearchFieldValuesQuery,
  useRescanFieldValuesMutation,
  useDiscardFieldValuesMutation,
} = fieldApi;

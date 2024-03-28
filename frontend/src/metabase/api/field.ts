import type {
  FieldId,
  SearchFieldValuesRequest,
  FieldValue,
  GetFieldValuesResponse,
  Field,
  GetFieldRequest,
  UpdateFieldRequest,
  CreateFieldDimensionRequest,
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
    updateField: builder.mutation<Field, UpdateFieldRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/field/${id}`,
        body,
      }),
      invalidatesTags: (response, error, { id }) => [
        idTag("field", id),
        idTag("field-values", id),
        tag("table-metadata"),
        tag("table-foreign-keys"),
        tag("database-metadata"),
        tag("database-id-fields"),
      ],
    }),
    createFieldDimension: builder.mutation<void, CreateFieldDimensionRequest>({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `/api/field/${id}/dimension`,
        body,
      }),
      invalidatesTags: (result, error, { id }) => [
        idTag("field", id),
        idTag("field-values", id),
      ],
    }),
    deleteFieldDimension: builder.mutation<void, FieldId>({
      query: id => ({
        method: "DELETE",
        url: `/api/field/${id}/dimension`,
      }),
      invalidatesTags: (result, error, id) => [
        idTag("field", id),
        idTag("field-values", id),
      ],
    }),
    rescanFieldValues: builder.mutation<void, FieldId>({
      query: id => ({
        method: "POST",
        url: `/api/field/${id}/rescan_values`,
      }),
      invalidatesTags: (result, error, id) => [idTag("field-values", id)],
    }),
    discardFieldValues: builder.mutation<void, FieldId>({
      query: id => ({
        method: "POST",
        url: `/api/field/${id}/discard_values`,
      }),
      invalidatesTags: (result, error, id) => [idTag("field-values", id)],
    }),
  }),
});

export const {
  useGetFieldQuery,
  useUpdateFieldMutation,
  useGetFieldValuesQuery,
  useSearchFieldValuesQuery,
  useCreateFieldDimensionMutation,
  useDeleteFieldDimensionMutation,
  useRescanFieldValuesMutation,
  useDiscardFieldValuesMutation,
} = fieldApi;

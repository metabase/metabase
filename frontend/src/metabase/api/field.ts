import { PLUGIN_API } from "metabase/plugins";
import type {
  CreateFieldDimensionRequest,
  Field,
  FieldId,
  FieldValue,
  GetFieldRequest,
  GetFieldValuesResponse,
  GetRemappedFieldValueRequest,
  SearchFieldValuesRequest,
  UpdateFieldRequest,
  UpdateFieldValuesRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideFieldTags,
  provideFieldValuesTags,
  provideRemappedFieldValuesTags,
  tag,
} from "./tags";

export const fieldApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getField: builder.query<Field, GetFieldRequest>({
      query: ({ id, ...params }) => ({
        method: "GET",
        url: `/api/field/${id}`,
        params,
      }),
      providesTags: (field) => (field ? provideFieldTags(field) : []),
    }),
    getFieldValues: builder.query<GetFieldValuesResponse, FieldId>({
      query: (fieldId) => ({
        method: "GET",
        url: PLUGIN_API.getFieldValuesUrl(fieldId),
      }),
      providesTags: (_, error, fieldId) => provideFieldValuesTags(fieldId),
    }),
    getRemappedFieldValue: builder.query<
      FieldValue,
      GetRemappedFieldValueRequest
    >({
      query: ({ fieldId, remappedFieldId, ...params }) => ({
        method: "GET",
        url: PLUGIN_API.getRemappedFieldValueUrl(fieldId, remappedFieldId),
        params,
      }),
      providesTags: (_response, _error, { fieldId, remappedFieldId }) =>
        provideRemappedFieldValuesTags(fieldId, remappedFieldId),
    }),
    searchFieldValues: builder.query<FieldValue[], SearchFieldValuesRequest>({
      query: ({ fieldId, searchFieldId, ...params }) => ({
        method: "GET",
        url: PLUGIN_API.getSearchFieldValuesUrl(fieldId, searchFieldId),
        params,
      }),
      providesTags: (_response, _error, { fieldId, searchFieldId }) =>
        provideRemappedFieldValuesTags(fieldId, searchFieldId),
    }),
    updateField: builder.mutation<Field, UpdateFieldRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/field/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("field"),
          idTag("field", id),
          idTag("field-values", id),
          tag("card"),
        ]),
    }),
    updateFieldValues: builder.mutation<void, UpdateFieldValuesRequest>({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `/api/field/${id}/values`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("field-values", id)]),
    }),
    createFieldDimension: builder.mutation<void, CreateFieldDimensionRequest>({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `/api/field/${id}/dimension`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("field", id), idTag("field-values", id)]),
    }),
    deleteFieldDimension: builder.mutation<void, FieldId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/field/${id}/dimension`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("field", id), idTag("field-values", id)]),
    }),
    rescanFieldValues: builder.mutation<void, FieldId>({
      query: (id) => ({
        method: "POST",
        url: `/api/field/${id}/rescan_values`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("field-values", id)]),
    }),
    discardFieldValues: builder.mutation<void, FieldId>({
      query: (id) => ({
        method: "POST",
        url: `/api/field/${id}/discard_values`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("field-values", id)]),
    }),
  }),
});

export const {
  useGetFieldQuery,
  useGetFieldValuesQuery,
  useGetRemappedFieldValueQuery,
  useSearchFieldValuesQuery,
  useUpdateFieldMutation,
  useUpdateFieldValuesMutation,
  useCreateFieldDimensionMutation,
  useDeleteFieldDimensionMutation,
  useRescanFieldValuesMutation,
  useDiscardFieldValuesMutation,
} = fieldApi;

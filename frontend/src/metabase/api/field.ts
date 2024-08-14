import type {
  FieldId,
  SearchFieldValuesRequest,
  FieldValue,
  GetFieldValuesResponse,
  Field,
  GetFieldRequest,
  UpdateFieldRequest,
  CreateFieldDimensionRequest,
  UpdateFieldValuesRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  provideFieldTags,
  provideFieldValuesTags,
  idTag,
  invalidateTags,
  listTag,
  tag,
} from "./tags";

export const fieldApi = Api.injectEndpoints({
  endpoints: builder => ({
    getField: builder.query<Field, GetFieldRequest>({
      query: ({ id, ...params }) => ({
        method: "GET",
        url: `/api/field/${id}`,
        params,
      }),
      providesTags: field => (field ? provideFieldTags(field) : []),
    }),
    getFieldValues: builder.query<GetFieldValuesResponse, FieldId>({
      query: id => ({
        method: "GET",
        url: `/api/field/${id}/values`,
      }),
      providesTags: (_, error, fieldId) => provideFieldValuesTags(fieldId),
    }),
    searchFieldValues: builder.query<FieldValue[], SearchFieldValuesRequest>({
      query: ({ fieldId, searchFieldId, ...params }) => ({
        method: "GET",
        url: `/api/field/${fieldId}/search/${searchFieldId}`,
        params,
      }),
      providesTags: (_, error, { fieldId }) => provideFieldValuesTags(fieldId),
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
      query: id => ({
        method: "DELETE",
        url: `/api/field/${id}/dimension`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("field", id), idTag("field-values", id)]),
    }),
    rescanFieldValues: builder.mutation<void, FieldId>({
      query: id => ({
        method: "POST",
        url: `/api/field/${id}/rescan_values`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("field-values", id)]),
    }),
    discardFieldValues: builder.mutation<void, FieldId>({
      query: id => ({
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
  useSearchFieldValuesQuery,
  useUpdateFieldMutation,
  useUpdateFieldValuesMutation,
  useCreateFieldDimensionMutation,
  useDeleteFieldDimensionMutation,
  useRescanFieldValuesMutation,
  useDiscardFieldValuesMutation,
} = fieldApi;

import type {
  CreateFieldDimensionRequest,
  Field,
  FieldDimension,
  FieldId,
  FieldValue,
  GetFieldRequest,
  GetFieldTableIdsRequest,
  GetFieldTableIdsResponse,
  GetFieldValuesResponse,
  GetRemappedFieldValueRequest,
  SearchFieldValuesRequest,
  UpdateFieldRequest,
  UpdateFieldValuesRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { patchCachedTableMetadata, selectCachedTableMetadata } from "./table";
import {
  idTag,
  invalidateTags,
  listTag,
  provideFieldTags,
  provideFieldValuesTags,
  provideRemappedFieldValuesTags,
  tag,
} from "./tags";
import { rollbackOnError } from "./utils/rollback-on-error";

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
    getFieldTableIds: builder.query<
      GetFieldTableIdsResponse,
      GetFieldTableIdsRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/field/table-ids",
        body,
      }),
      providesTags: [listTag("field")],
    }),
    getFieldValues: builder.query<GetFieldValuesResponse, FieldId>({
      query: (fieldId) => ({
        method: "GET",
        url: `/api/field/${fieldId}/values`,
      }),
      providesTags: (_, error, fieldId) => provideFieldValuesTags(fieldId),
    }),
    getRemappedFieldValue: builder.query<
      FieldValue,
      GetRemappedFieldValueRequest
    >({
      query: ({ fieldId, remappedFieldId, ...params }) => ({
        method: "GET",
        url: `/api/field/${fieldId}/remapping/${remappedFieldId}`,
        params,
      }),
      providesTags: (_response, _error, { fieldId, remappedFieldId }) =>
        provideRemappedFieldValuesTags(fieldId, remappedFieldId),
    }),
    searchFieldValues: builder.query<FieldValue[], SearchFieldValuesRequest>({
      query: ({ fieldId, searchFieldId, ...params }) => ({
        method: "GET",
        url: `/api/field/${fieldId}/search/${searchFieldId}`,
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
          tag("parameter-values"),
          tag("card"),
          tag("dataset"),
        ]),
      onQueryStarted: async (
        { id, ...body },
        { dispatch, getState, queryFulfilled },
      ) => {
        const patches = selectCachedTableMetadata(getState(), [
          idTag("field", id),
        ]).map(({ originalArgs }) =>
          dispatch(
            patchCachedTableMetadata(originalArgs, (table) => {
              const field = table.fields?.find(
                ({ id: fieldId }) => fieldId === id,
              );

              if (field) {
                Object.assign(field, body);
              }
            }),
          ),
        );

        await rollbackOnError(queryFulfilled, patches);
      },
    }),
    updateFieldValues: builder.mutation<void, UpdateFieldValuesRequest>({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `/api/field/${id}/values`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          idTag("field-values", id),
          tag("parameter-values"),
        ]),
    }),
    createFieldDimension: builder.mutation<
      FieldDimension,
      CreateFieldDimensionRequest
    >({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `/api/field/${id}/dimension`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          idTag("field", id),
          idTag("field-values", id),
          tag("parameter-values"),
          tag("dataset"),
        ]),
    }),
    deleteFieldDimension: builder.mutation<void, FieldId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/field/${id}/dimension`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          idTag("field", id),
          idTag("field-values", id),
          tag("parameter-values"),
          tag("dataset"),
        ]),
    }),
    rescanFieldValues: builder.mutation<void, FieldId>({
      query: (id) => ({
        method: "POST",
        url: `/api/field/${id}/rescan_values`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          idTag("field-values", id),
          tag("parameter-values"),
        ]),
    }),
    discardFieldValues: builder.mutation<void, FieldId>({
      query: (id) => ({
        method: "POST",
        url: `/api/field/${id}/discard_values`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          idTag("field-values", id),
          tag("parameter-values"),
        ]),
    }),
  }),
});

export const {
  useGetFieldQuery,
  useLazyGetFieldQuery,
  useGetFieldTableIdsQuery,
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

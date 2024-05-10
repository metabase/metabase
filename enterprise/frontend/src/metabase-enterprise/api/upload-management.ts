import { Api } from "metabase/api";
import { provideTableListTags, invalidateTags, tag } from "metabase/api/tags";
import type {
  DeleteUploadTableRequest,
  UploadManagementResponse,
} from "metabase-types/api";

export const uploadManagementApi = Api.injectEndpoints({
  endpoints: builder => ({
    listUploadTables: builder.query<UploadManagementResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/upload-management/tables",
      }),
      providesTags: (tables = []) => provideTableListTags(tables),
    }),
    deleteUploadTable: builder.mutation<boolean, DeleteUploadTableRequest>({
      query: ({ tableId, ...params }) => ({
        method: "DELETE",
        url: `/api/ee/upload-management/tables/${tableId}`,
        params,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          tag("database"),
          tag("schema"),
          tag("table"),
          tag("field"),
          tag("field-values"),
          tag("card"),
        ]),
    }),
  }),
});

export const { useListUploadTablesQuery, useDeleteUploadTableMutation } =
  uploadManagementApi;

import type {
  BulkTableRequest,
  PublishTablesResponse,
  Table,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, tag } from "./tags";

export const tableApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    createSeed: builder.mutation<Table, { name: string; file: File }>({
      query: ({ name, file }) => {
        const formData = new FormData();
        formData.append("name", name);
        formData.append("file", file);
        return {
          method: "POST",
          url: "/api/ee/data-studio/table/seed",
          body: formData,
        };
      },
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("table"), tag("collection")]),
    }),
    publishTables: builder.mutation<PublishTablesResponse, BulkTableRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/data-studio/table/publish-tables",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("table"), tag("card"), tag("collection")]),
    }),
    unpublishTables: builder.mutation<void, BulkTableRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/data-studio/table/unpublish-tables",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("table"), tag("card"), tag("collection")]),
    }),
  }),
});

export const {
  useCreateSeedMutation,
  usePublishTablesMutation,
  useUnpublishTablesMutation,
} = tableApi;

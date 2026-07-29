import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag, tag } from "./tags";

export type SeedOrigin = "git" | "upload";

export type Seed = {
  id: number;
  name: string;
  origin: SeedOrigin;
  table_id: number | null;
  collection_id: number | null;
  csv_hash: string | null;
  target_db_id: number | null;
  database_name: string | null;
  schema_name: string | null;
  last_synced_sha: string | null;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateSeedRequest = {
  name: string;
  file: File;
  databaseId?: number;
  schema?: string;
};

// Seeds have two origins: git-authored (read-only here, managed by remote sync) and uploaded in the
// app (created/edited via these mutations). A seed materializes a table, so mutations also refresh
// the table list, its collection, and any cached rows.
export const seedApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listSeeds: builder.query<Seed[], void>({
      query: () => ({ method: "GET", url: "/api/ee/data-studio/seed" }),
      providesTags: [listTag("seed")],
    }),
    createSeed: builder.mutation<Seed, CreateSeedRequest>({
      query: ({ name, file, databaseId, schema }) => {
        const formData = new FormData();
        formData.append("name", name);
        formData.append("file", file);
        if (databaseId != null) {
          formData.append("database_id", String(databaseId));
        }
        if (schema) {
          formData.append("schema", schema);
        }
        return {
          method: "POST",
          url: "/api/ee/data-studio/seed",
          body: formData,
        };
      },
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          listTag("seed"),
          listTag("table"),
          tag("collection"),
        ]),
    }),
    replaceSeedCsv: builder.mutation<Seed, { id: number; file: File }>({
      query: ({ id, file }) => {
        const formData = new FormData();
        formData.append("file", file);
        return {
          method: "POST",
          url: `/api/ee/data-studio/seed/${id}/csv`,
          body: formData,
        };
      },
      // Replace rebuilds the table, so refresh its metadata (columns) and cached rows too.
      invalidatesTags: (result, error) =>
        invalidateTags(error, [
          listTag("seed"),
          listTag("table"),
          ...(result?.table_id != null
            ? [idTag("table", result.table_id)]
            : []),
          tag("dataset"),
        ]),
    }),
    deleteSeed: builder.mutation<void, number>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/data-studio/seed/${id}`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          listTag("seed"),
          listTag("table"),
          tag("collection"),
        ]),
    }),
  }),
});

export const {
  useListSeedsQuery,
  useCreateSeedMutation,
  useReplaceSeedCsvMutation,
  useDeleteSeedMutation,
} = seedApi;

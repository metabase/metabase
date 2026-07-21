import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag, tag } from "./tags";

export type Seed = {
  id: number;
  name: string;
  table_id: number | null;
  collection_id: number | null;
  csv_hash: string | null;
  last_synced_sha: string | null;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
};

// Seeds piggyback on the "table" tag: no "seed" tag type is registered in the
// shared tag list, and every seed mutation changes tables anyway (POC).
export const seedApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listSeeds: builder.query<Seed[], void>({
      query: () => ({ method: "GET", url: "/api/ee/data-studio/seed" }),
      providesTags: [listTag("table")],
    }),
    createSeed: builder.mutation<Seed, { name: string; file: File }>({
      query: ({ name, file }) => {
        const formData = new FormData();
        formData.append("name", name);
        formData.append("file", file);
        return {
          method: "POST",
          url: "/api/ee/data-studio/seed",
          body: formData,
        };
      },
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("table"), tag("collection")]),
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
      // Replace rebuilds the table, so refresh its metadata (columns) and the
      // adhoc dataset cache (rows) too, not just the table list.
      invalidatesTags: (result, error) =>
        invalidateTags(error, [
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
        invalidateTags(error, [listTag("table"), tag("collection")]),
    }),
  }),
});

export const {
  useListSeedsQuery,
  useCreateSeedMutation,
  useReplaceSeedCsvMutation,
  useDeleteSeedMutation,
} = seedApi;

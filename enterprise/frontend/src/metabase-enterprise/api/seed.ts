import { EnterpriseApi } from "./api";
import { listTag } from "./tags";

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

// Seeds are git-authored: created and edited as seeds/<name>.csv in the remote-sync
// repo and materialized on pull. This surface is read-only; there are no mutations.
export const seedApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listSeeds: builder.query<Seed[], void>({
      query: () => ({ method: "GET", url: "/api/ee/data-studio/seed" }),
      providesTags: [listTag("seed")],
    }),
  }),
});

export const { useListSeedsQuery } = seedApi;

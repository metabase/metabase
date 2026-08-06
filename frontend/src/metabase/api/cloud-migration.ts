import type { CloudMigration } from "metabase-types/api/cloud-migration";

import { Api } from "./api";
import { listTag, tag } from "./tags";

export const clouldMigrationApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getCloudMigration: builder.query<CloudMigration, void>({
      query: () => `/api/cloud-migration`,
      providesTags: () => [listTag("cloud-migration")],
    }),
    // Starting/cancelling a migration flips server-side settings (e.g.
    // read-only mode), so both mutations also invalidate session-properties.
    createCloudMigration: builder.mutation<CloudMigration, void>({
      query: () => ({
        method: "POST",
        url: `/api/cloud-migration`,
      }),
      invalidatesTags: () => [
        listTag("cloud-migration"),
        tag("session-properties"),
      ],
    }),
    cancelCloudMigration: builder.mutation<void, void>({
      query: () => ({
        method: "PUT",
        url: `/api/cloud-migration/cancel`,
      }),
      invalidatesTags: () => [
        listTag("cloud-migration"),
        tag("session-properties"),
      ],
    }),
  }),
});

export const {
  useGetCloudMigrationQuery,
  useCreateCloudMigrationMutation,
  useCancelCloudMigrationMutation,
} = clouldMigrationApi;

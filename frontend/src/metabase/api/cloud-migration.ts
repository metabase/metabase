import type { CloudMigration } from "metabase-types/api/cloud-migration";

import { Api } from "./api";
import { listTag } from "./tags";

export const clouldMigrationApi = Api.injectEndpoints({
  endpoints: builder => ({
    getCloudMigration: builder.query<CloudMigration, void>({
      query: () => `/api/cloud-migration`,
      providesTags: () => [listTag("cloud-migration")],
    }),
    createCloudMigration: builder.mutation<CloudMigration, void>({
      query: () => ({
        method: "POST",
        url: `/api/cloud-migration`,
      }),
      invalidatesTags: () => [listTag("cloud-migration")],
    }),
    cancelCloudMigration: builder.mutation<void, void>({
      query: () => ({
        method: "PUT",
        url: `/api/cloud-migration/cancel`,
      }),
      invalidatesTags: () => [listTag("cloud-migration")],
    }),
  }),
});

export const {
  useGetCloudMigrationQuery,
  useCreateCloudMigrationMutation,
  useCancelCloudMigrationMutation,
} = clouldMigrationApi;

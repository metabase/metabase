import type { DatabaseId } from "metabase-types/api";

import { Api } from "./api";

interface BlueprintItem {
  database_id?: DatabaseId;
  service_name?: string;
}

export const blueprintsApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listBlueprints: builder.query<BlueprintItem[], void>({
      queryFn: () => {
        return { data: [] };
      },
    }),
  }),
});

export const { useListBlueprintsQuery } = blueprintsApi;

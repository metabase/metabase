import { provideTableRemappingListTags } from "metabase/api/tags";
import type { TableRemapping } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, listTag } from "./tags";

export const workspaceInstanceApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listTableRemappings: builder.query<TableRemapping[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/workspace-instance/table-remappings",
      }),
      providesTags: (remappings = []) =>
        provideTableRemappingListTags(remappings),
    }),
    deleteTableRemappings: builder.mutation<void, void>({
      query: () => ({
        method: "DELETE",
        url: "/api/ee/workspace-instance/table-remappings",
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("table-remapping")]),
    }),
  }),
});

export const { useListTableRemappingsQuery, useDeleteTableRemappingsMutation } =
  workspaceInstanceApi;

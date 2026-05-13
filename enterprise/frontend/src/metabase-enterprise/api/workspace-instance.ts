import { provideTableRemappingListTags } from "metabase/api/tags";
import type { TableRemapping, WorkspaceInstance } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { tag } from "./tags";

export const workspaceInstanceApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getCurrentWorkspace: builder.query<WorkspaceInstance | null, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/workspace-instance/current",
      }),
      providesTags: [tag("workspace")],
    }),
    listTableRemappings: builder.query<TableRemapping[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/workspace-instance/table-remappings",
      }),
      providesTags: (remappings = []) =>
        provideTableRemappingListTags(remappings),
    }),
  }),
});

export const { useGetCurrentWorkspaceQuery, useListTableRemappingsQuery } =
  workspaceInstanceApi;

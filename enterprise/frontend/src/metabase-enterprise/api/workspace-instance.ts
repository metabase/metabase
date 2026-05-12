import type { TableRemapping, WorkspaceInstance } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const workspaceInstanceApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getCurrentWorkspace: builder.query<WorkspaceInstance | null, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/workspace-instance/current",
      }),
    }),
    listTableRemappings: builder.query<TableRemapping[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/workspace-instance/table-remappings",
      }),
    }),
  }),
});

export const { useGetCurrentWorkspaceQuery, useListTableRemappingsQuery } =
  workspaceInstanceApi;

import type { WorkspaceInstance, WorkspaceRemapping } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const workspaceInstanceApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getCurrentWorkspace: builder.query<WorkspaceInstance, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/workspace/current",
      }),
    }),
    listWorkspaceRemappings: builder.query<WorkspaceRemapping[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/workspace/remappings",
      }),
    }),
  }),
});

export const { useGetCurrentWorkspaceQuery, useListWorkspaceRemappingsQuery } =
  workspaceInstanceApi;

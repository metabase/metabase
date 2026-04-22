import type { WorkspaceRemapping } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const workspaceInstanceApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listWorkspaceRemappings: builder.query<WorkspaceRemapping[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/workspace/remappings",
      }),
    }),
  }),
});

export const { useListWorkspaceRemappingsQuery } = workspaceInstanceApi;

import type { CreateWorkspaceRequest, Workspace } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const workspaceApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    createWorkspace: builder.mutation<Workspace, CreateWorkspaceRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/workspace-manager",
        body,
      }),
    }),
  }),
});

export const { useCreateWorkspaceMutation } = workspaceApi;

import type { Workspace, WorkspaceId } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag } from "./tags";

export const workspaceApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getWorkspace: builder.query<Workspace, WorkspaceId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/${id}`,
      }),
      providesTags: (_workspace, _error, id) => [idTag("workspace", id)],
    }),
  }),
});

export const { useGetWorkspaceQuery } = workspaceApi;

import type {
  CreateWorkspaceRequest,
  Workspace,
  WorkspaceContents,
  WorkspaceId,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";

export const workspaceApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    createWorkspace: builder.mutation<Workspace, CreateWorkspaceRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/workspace",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("workspace")]),
    }),
    getWorkspaceContents: builder.query<WorkspaceContents, WorkspaceId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/${id}/contents`,
      }),
      providesTags: (_, error, id) =>
        invalidateTags(error, [idTag("workspace", id)]),
    }),
  }),
});

export const { useCreateWorkspaceMutation, useGetWorkspaceContentsQuery } =
  workspaceApi;

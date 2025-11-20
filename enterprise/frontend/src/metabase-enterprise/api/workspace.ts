import type {
  CreateWorkspaceRequest,
  Workspace,
  WorkspaceContents,
  WorkspaceId,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag, tag } from "./tags";

export const workspaceApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getWorkspace: builder.query<Workspace, WorkspaceId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/${id}`,
      }),
      providesTags: (_, error, id) =>
        invalidateTags(error, [idTag("workspace", id)]),
    }),
    createWorkspace: builder.mutation<Workspace, CreateWorkspaceRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/workspace",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          listTag("workspace"),
          listTag("transform"),
          tag("transform"),
        ]),
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

export const {
  useGetWorkspaceQuery,
  useCreateWorkspaceMutation,
  useGetWorkspaceContentsQuery,
} = workspaceApi;

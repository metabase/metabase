import type {
  CreateWorkspaceRequest,
  TransformDownstreamMapping,
  TransformId,
  TransformUpstreamMapping,
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
    getTransformUpstreamMapping: builder.query<
      TransformUpstreamMapping,
      TransformId
    >({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/mapping/transform/${id}/upstream`,
      }),
      providesTags: (_, error, id) =>
        invalidateTags(error, [idTag("transform", id)]),
    }),
    getTransformDownstreamMapping: builder.query<
      TransformDownstreamMapping,
      TransformId
    >({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/mapping/transform/${id}/downstream`,
      }),
      providesTags: (_, error, id) =>
        invalidateTags(error, [idTag("transform", id)]),
    }),
  }),
});

export const {
  useGetWorkspaceQuery,
  useCreateWorkspaceMutation,
  useGetWorkspaceContentsQuery,
  useGetTransformUpstreamMappingQuery,
  useGetTransformDownstreamMappingQuery,
} = workspaceApi;

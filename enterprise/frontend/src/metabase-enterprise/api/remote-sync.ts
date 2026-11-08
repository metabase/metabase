import type {
  CreateBranchRequest,
  CreateBranchResponse,
  ExportChangesRequest,
  ExportChangesResponse,
  ExportPreflightRequest,
  ExportPreflightResponse,
  GetBranchesResponse,
  HasRemoteChangesResponse,
  ImportChangesRequest,
  ImportChangesResponse,
  RemoteSyncChangesResponse,
  RemoteSyncTask,
  StashChangesRequest,
  StashChangesResponse,
  TestRemoteSyncConnectionRequest,
  TestRemoteSyncConnectionResponse,
  UpdateRemoteSyncSettingsRequest,
  UpdateRemoteSyncSettingsResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { tag } from "./tags";

export const remoteSyncApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getRemoteSyncChanges: builder.query<RemoteSyncChangesResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/remote-sync/dirty",
      }),
      providesTags: () => [tag("remote-sync-dirty")],
    }),
    getHasRemoteChanges: builder.query<HasRemoteChangesResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/remote-sync/has-remote-changes",
      }),
      providesTags: () => [tag("remote-sync-remote-changes")],
    }),
    getExportPreflight: builder.query<
      ExportPreflightResponse,
      ExportPreflightRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/remote-sync/export-preflight",
        params,
      }),
      providesTags: () => [tag("remote-sync-remote-changes")],
    }),
    getRemoteSyncCurrentTask: builder.query<RemoteSyncTask | null, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/remote-sync/current-task",
      }),
      providesTags: () => [tag("remote-sync-current-task")],
    }),
    getRemoteSyncBranches: builder.query<GetBranchesResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/remote-sync/branches",
      }),
      providesTags: () => [tag("remote-sync-branches")],
    }),
    exportChanges: builder.mutation<
      ExportChangesResponse,
      ExportChangesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/remote-sync/export",
        body,
      }),
      invalidatesTags: () => [tag("remote-sync-current-task")],
    }),
    importChanges: builder.mutation<
      ImportChangesResponse,
      ImportChangesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/remote-sync/import",
        body,
      }),
      invalidatesTags: () => [tag("remote-sync-current-task")],
    }),
    stashChanges: builder.mutation<StashChangesResponse, StashChangesRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/remote-sync/stash",
        body,
      }),
      invalidatesTags: () => [
        tag("remote-sync-current-task"),
        tag("remote-sync-branches"),
      ],
    }),
    createRemoteSyncBranch: builder.mutation<
      CreateBranchResponse,
      CreateBranchRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/remote-sync/create-branch",
        body,
      }),
      invalidatesTags: () => [
        tag("remote-sync-branches"),
        tag("session-properties"),
      ],
    }),
    updateRemoteSyncSettings: builder.mutation<
      UpdateRemoteSyncSettingsResponse,
      UpdateRemoteSyncSettingsRequest
    >({
      query: (body) => ({
        method: "PUT",
        url: "/api/ee/remote-sync/settings",
        body,
      }),
      invalidatesTags: () => [
        tag("session-properties"),
        tag("collection"),
        tag("remote-sync-current-task"),
        tag("remote-sync-dirty"),
        tag("remote-sync-branches"),
      ],
    }),
    cancelRemoteSyncCurrentTask: builder.mutation<RemoteSyncTask, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/remote-sync/current-task/cancel",
      }),
      invalidatesTags: () => [tag("remote-sync-current-task")],
    }),
    testRemoteSyncConnection: builder.mutation<
      TestRemoteSyncConnectionResponse,
      TestRemoteSyncConnectionRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/remote-sync/test-connection",
        body,
      }),
    }),
  }),
});

export const {
  useGetRemoteSyncChangesQuery,
  useGetHasRemoteChangesQuery,
  useLazyGetExportPreflightQuery,
  useGetRemoteSyncCurrentTaskQuery,
  useGetRemoteSyncBranchesQuery,
  useExportChangesMutation,
  useImportChangesMutation,
  useStashChangesMutation,
  useCreateRemoteSyncBranchMutation,
  useUpdateRemoteSyncSettingsMutation,
  useCancelRemoteSyncCurrentTaskMutation,
  useTestRemoteSyncConnectionMutation,
} = remoteSyncApi;

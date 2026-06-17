import { provideTableRemappingListTags } from "metabase/api/tags";
import type {
  CurrentWorkspace,
  GetCurrentWorkspaceResponse,
  TableRemapping,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, listTag, tag } from "./tags";

export const workspaceInstanceApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getCurrentWorkspace: builder.query<CurrentWorkspace | null, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/workspace-instance/current",
      }),
      transformResponse: (response: GetCurrentWorkspaceResponse) =>
        response.data,
      providesTags: [tag("workspace")],
    }),
    deleteCurrentWorkspace: builder.mutation<void, void>({
      query: () => ({
        method: "DELETE",
        url: "/api/ee/workspace-instance/current",
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("workspace"), listTag("workspace")]),
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

export const {
  useGetCurrentWorkspaceQuery,
  useDeleteCurrentWorkspaceMutation,
  useListTableRemappingsQuery,
} = workspaceInstanceApi;

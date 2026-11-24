import type {
  PermissionPreviewId,
  PermissionPreviewSession,
  StartPermissionPreviewRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const permissionPreviewApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    startPermissionPreview: builder.mutation<
      PermissionPreviewSession,
      StartPermissionPreviewRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/permission_debug/preview/session",
        body,
      }),
    }),
    endPermissionPreview: builder.mutation<void, PermissionPreviewId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/permission_debug/preview/session/${id}`,
      }),
    }),
  }),
});

export const {
  useStartPermissionPreviewMutation,
  useEndPermissionPreviewMutation,
} = permissionPreviewApi;

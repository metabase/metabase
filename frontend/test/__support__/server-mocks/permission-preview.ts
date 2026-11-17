import fetchMock from "fetch-mock";

import type {
  AffectingAttribute,
  CollectionNamespace,
  PermissionDebugRequest,
  PermissionDebugResponse,
  PreviewCollectionsResponse,
  PreviewDataResponse,
  PreviewPrincipalsResponse,
  UnsavedEdit,
} from "metabase-enterprise/permission_preview/api";

export function setupPermissionPreviewPrincipalsEndpoint(
  response: PreviewPrincipalsResponse,
) {
  fetchMock.get("path:/api/ee/permission_debug/preview/principals", response);
}

export function setupPermissionPreviewDataEndpoint(
  response: PreviewDataResponse,
) {
  fetchMock.get("path:/api/ee/permission_debug/preview/data", response);
}

export function setupPermissionPreviewCollectionsEndpoint(
  namespace: CollectionNamespace,
  response: PreviewCollectionsResponse,
) {
  fetchMock.get({
    url: "path:/api/ee/permission_debug/preview/collections",
    query: { namespace },
    response,
  });
}

export function setupPermissionDebugEndpoint(
  { userId, modelId, actionType }: PermissionDebugRequest,
  response: PermissionDebugResponse,
) {
  fetchMock.get({
    url: "path:/api/ee/permission_debug",
    query: { user_id: userId, model_id: modelId, action_type: actionType },
    response,
  });
}

export function setupPermissionPreviewUnsavedEditsEndpoint(
  unsavedEditsId: string,
  edits: UnsavedEdit[],
) {
  fetchMock.get(
    `path:/api/ee/permission_debug/preview/unsaved-edits/${unsavedEditsId}`,
    { edits },
  );
}

export function setupPermissionPreviewAttributesEndpoint(
  response: AffectingAttribute[],
) {
  fetchMock.get("path:/api/ee/permission_debug/preview/attributes", response);
}

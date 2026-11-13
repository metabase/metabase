import fetchMock from "fetch-mock";

import type {
  PreviewDataResponse,
  PreviewPrincipalsResponse,
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

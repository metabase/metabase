import fetchMock from "fetch-mock";

import type {
  DataApp,
  DataAppGroup,
  DataAppGroupPermissionWarning,
  DataAppId,
  DataAppRepoStatus,
  GroupId,
} from "metabase-types/api";

import type { MockResponse } from "./types";

export function setupListDataAppsEndpoint(
  apps: MockResponse<DataApp[]>,
  delay?: number,
) {
  fetchMock.get("path:/api/ee/apps", apps, { delay });
}

export function setupDataAppEndpoint(app: DataApp) {
  fetchMock.get(`path:/api/ee/apps/slug/${app.name}`, app);
}

export function setupDataAppRepoStatusEndpoint(status: DataAppRepoStatus) {
  fetchMock.get("path:/api/ee/apps/repo-status", status);
}

export function setupDataAppRepoStatusEndpointWithError(error: string) {
  fetchMock.get("path:/api/ee/apps/repo-status", { status: 500, body: error });
}

export function setupUpdateDataAppEndpoint(app: DataApp) {
  fetchMock.put(`path:/api/ee/apps/${app.id}`, app);
}

export function setupDataAppGroupsEndpoint(
  id: DataAppId,
  groups: DataAppGroup[],
) {
  fetchMock.get(`path:/api/ee/apps/${id}/groups`, groups);
}

export function setupDataAppGroupPermissionWarningsEndpoint(
  id: DataAppId,
  warnings: DataAppGroupPermissionWarning[],
) {
  fetchMock.get(`path:/api/ee/apps/${id}/group-permission-warnings`, warnings);
}

export function setupAddDataAppGroupsEndpoint(
  id: DataAppId,
  groups: DataAppGroup[],
) {
  fetchMock.post(`path:/api/ee/apps/${id}/groups`, groups);
}

export function setupRemoveDataAppGroupEndpoint(
  id: DataAppId,
  groupId: GroupId,
) {
  fetchMock.delete(`path:/api/ee/apps/${id}/groups/${groupId}`, 204);
}

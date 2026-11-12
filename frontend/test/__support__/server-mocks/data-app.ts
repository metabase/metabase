import fetchMock from "fetch-mock";

import type {
  DataApp,
  DataAppGroup,
  DataAppGroupPermissionWarning,
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
  fetchMock.get(`path:/api/ee/apps/${app.slug}`, app);
}

export function setupDataAppRepoStatusEndpoint(status: DataAppRepoStatus) {
  fetchMock.get("path:/api/ee/apps/repo-status", status);
}

export function setupDataAppRepoStatusEndpointWithError(error: string) {
  fetchMock.get("path:/api/ee/apps/repo-status", { status: 500, body: error });
}

export function setupUpdateDataAppEndpoint(app: DataApp) {
  fetchMock.put(`path:/api/ee/apps/${app.slug}`, app);
}

export function setupDataAppGroupsEndpoint(
  slug: string,
  groups: DataAppGroup[],
) {
  fetchMock.get(`path:/api/ee/apps/${slug}/groups`, groups);
}

export function setupDataAppGroupPermissionWarningsEndpoint(
  slug: string,
  warnings: DataAppGroupPermissionWarning[],
) {
  fetchMock.get(
    `path:/api/ee/apps/${slug}/group-permission-warnings`,
    warnings,
  );
}

export function setupAddDataAppGroupsEndpoint(
  slug: string,
  groups: DataAppGroup[],
) {
  fetchMock.post(`path:/api/ee/apps/${slug}/groups`, groups);
}

export function setupRemoveDataAppGroupEndpoint(
  slug: string,
  groupId: GroupId,
) {
  fetchMock.delete(`path:/api/ee/apps/${slug}/groups/${groupId}`, 204);
}

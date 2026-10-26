import fetchMock from "fetch-mock";

import type {
  DataApp,
  DataAppGroup,
  DataAppGroupPermissionWarning,
  DataAppRepoStatus,
  GroupId,
} from "metabase-types/api";

export function setupListDataAppsEndpoint(apps: DataApp[], delay?: number) {
  fetchMock.get("path:/api/ee/apps", apps, { delay });
}

export function setupListDataAppsEndpointWithError(error: string) {
  fetchMock.get("path:/api/ee/apps", { status: 500, body: error });
}

export function setupDataAppRepoStatusEndpoint(status: DataAppRepoStatus) {
  fetchMock.get("path:/api/ee/apps/repo-status", status);
}

export function setupDataAppRepoStatusEndpointWithError(error: string) {
  fetchMock.get("path:/api/ee/apps/repo-status", { status: 500, body: error });
}

export function setupUpdateDataAppEndpoint(app: DataApp) {
  fetchMock.put(`path:/api/ee/apps/${app.name}`, app);
}

export function setupDeleteDataAppEndpoint(name: string) {
  fetchMock.delete(`path:/api/ee/apps/${name}`, 204);
}

export function setupDataAppGroupsEndpoint(
  name: string,
  groups: DataAppGroup[],
) {
  fetchMock.get(`path:/api/ee/apps/${name}/groups`, groups);
}

export function setupDataAppGroupPermissionWarningsEndpoint(
  name: string,
  warnings: DataAppGroupPermissionWarning[],
) {
  fetchMock.get(
    `path:/api/ee/apps/${name}/group-permission-warnings`,
    warnings,
  );
}

export function setupAddDataAppGroupsEndpoint(
  name: string,
  groups: DataAppGroup[],
) {
  fetchMock.post(`path:/api/ee/apps/${name}/groups`, groups);
}

export function setupRemoveDataAppGroupEndpoint(
  name: string,
  groupId: GroupId,
) {
  fetchMock.delete(`path:/api/ee/apps/${name}/groups/${groupId}`, 204);
}

import fetchMock from "fetch-mock";

import type { DataApp, DataAppRepoStatus } from "metabase-types/api";

export function setupListDataAppsEndpoint(apps: DataApp[]) {
  fetchMock.get("path:/api/apps", apps);
}

export function setupListDataAppsEndpointWithError(error: string) {
  fetchMock.get("path:/api/apps", { status: 500, body: error });
}

export function setupDataAppRepoStatusEndpoint(status: DataAppRepoStatus) {
  fetchMock.get("path:/api/apps/repo-status", status);
}

export function setupDataAppRepoStatusEndpointWithError(error: string) {
  fetchMock.get("path:/api/apps/repo-status", { status: 500, body: error });
}

export function setupUpdateDataAppEndpoint(app: DataApp) {
  fetchMock.put(`path:/api/apps/${app.name}`, app);
}

export function setupDeleteDataAppEndpoint(name: string) {
  fetchMock.delete(`path:/api/apps/${name}`, 204);
}

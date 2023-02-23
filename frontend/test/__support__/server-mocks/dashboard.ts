import fetchMock from "fetch-mock";
import { Dashboard } from "metabase-types/api";
import { createMockDashboard } from "metabase-types/api/mocks";
import { getRequestBody } from "./utils";

export function setupDashboardEndpoints(dashboard: Dashboard) {
  fetchMock.get(`path:/api/dashboard/${dashboard.id}`, dashboard);
  fetchMock.put(`path:/api/dashboard/${dashboard.id}`, async (url, request) => {
    return createMockDashboard(await getRequestBody(url, request));
  });
}

export function setupDashboardsEndpoints(dashboards: Dashboard[]) {
  fetchMock.get("path:/api/dashboard", dashboards);
  dashboards.forEach(dashboard => setupDashboardEndpoints(dashboard));
}

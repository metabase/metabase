import fetchMock from "fetch-mock";
import { Dashboard } from "metabase-types/api";
import { createMockDashboard } from "metabase-types/api/mocks";

export function setupDashboardEndpoints(dashboard: Dashboard) {
  fetchMock.get(`path:/api/dashboard/${dashboard.id}`, dashboard);
  fetchMock.put(`path:/api/dashboard/${dashboard.id}`, async url => {
    const lastCall = fetchMock.lastCall(url);
    return createMockDashboard(await lastCall?.request?.json());
  });
}

export function setupDashboardsEndpoints(dashboards: Dashboard[]) {
  fetchMock.get("path:/api/dashboard", dashboards);
  dashboards.forEach(dashboard => setupDashboardEndpoints(dashboard));
}

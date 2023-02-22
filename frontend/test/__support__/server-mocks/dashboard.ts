import fetchMock from "fetch-mock";
import { Dashboard } from "metabase-types/api";
import { createMockDashboard } from "metabase-types/api/mocks";

export function setupDashboardEndpoints(dashboard: Dashboard) {
  fetchMock.get(`path:/api/dashboard/${dashboard.id}`, dashboard);
  fetchMock.put(`path:/api/dashboard/${dashboard.id}`, async (uri, request) => {
    const body = await request.body;
    const data = typeof body === "string" ? JSON.parse(body) : body;
    return createMockDashboard(data);
  });
}

export function setupDashboardsEndpoints(dashboards: Dashboard[]) {
  fetchMock.get("path:/api/dashboard", dashboards);
  dashboards.forEach(dashboard => setupDashboardEndpoints(dashboard));
}

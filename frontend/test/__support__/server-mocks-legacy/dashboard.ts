import { Scope } from "nock";
import { Dashboard } from "metabase-types/api";
import { createMockDashboard } from "metabase-types/api/mocks";

export function setupDashboardEndpoints(scope: Scope, dashboard: Dashboard) {
  scope.get(`/api/dashboard/${dashboard.id}`).reply(200, dashboard);
  scope
    .put(`/api/dashboard/${dashboard.id}`)
    .reply(200, (uri, body) => createMockDashboard(body as Dashboard));
}

export function setupDashboardsEndpoints(
  scope: Scope,
  dashboards: Dashboard[],
) {
  scope.get("/api/dashboard").reply(200, dashboards);
  dashboards.forEach(dashboard => setupDashboardEndpoints(scope, dashboard));
}

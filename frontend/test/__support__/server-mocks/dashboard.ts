import fetchMock from "fetch-mock";

import type {
  Card,
  Dashboard,
  DashboardId,
  Database,
} from "metabase-types/api";
import { createMockDashboard } from "metabase-types/api/mocks";

export function setupDashboardEndpoints(dashboard: Dashboard) {
  fetchMock.get(`path:/api/dashboard/${dashboard.id}`, dashboard);
  fetchMock.put(`path:/api/dashboard/${dashboard.id}`, async url => {
    const lastCall = fetchMock.lastCall(url);
    return createMockDashboard(await lastCall?.request?.json());
  });
}

export function setupDashboardMetadataEndpoint(
  dashboard: Dashboard,
  databases: Database[],
  cards: Card[] = [],
  dashboards: Dashboard[] = [],
) {
  const tables = databases.flatMap(database => database.tables ?? []);
  const fields = tables.flatMap(table => table.fields ?? []);

  fetchMock.get(`path:/api/dashboard/${dashboard.id}/query_metadata`, {
    databases,
    tables,
    fields,
    cards,
    dashboards,
  });
}

export function setupDashboardsEndpoints(dashboards: Dashboard[]) {
  fetchMock.get("path:/api/dashboard", dashboards);
  dashboards.forEach(dashboard => setupDashboardEndpoints(dashboard));
}

export function setupDashboardNotFoundEndpoint(dashboard: Dashboard) {
  fetchMock.get(`path:/api/dashboard/${dashboard.id}`, 404);
}

export function setupDashboardPublicLinkEndpoints(dashboardId: DashboardId) {
  fetchMock.post(`path:/api/dashboard/${dashboardId}/public_link`, {
    id: dashboardId,
    uuid: "mock-uuid",
  });
  fetchMock.delete(`path:/api/dashboard/${dashboardId}/public_link`, {
    id: dashboardId,
  });
}

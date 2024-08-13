import fetchMock from "fetch-mock";

import type {
  Dashboard,
  DashboardId,
  DashboardQueryMetadata,
} from "metabase-types/api";
import { createMockDashboard } from "metabase-types/api/mocks";

export function setupDashboardEndpoints(dashboard: Dashboard) {
  fetchMock.get(`path:/api/dashboard/${dashboard.id}`, dashboard);
  fetchMock.put(`path:/api/dashboard/${dashboard.id}`, async url => {
    const lastCall = fetchMock.lastCall(url);
    return createMockDashboard(await lastCall?.request?.json());
  });
}

export function setupDashboardQueryMetadataEndpoint(
  dashboard: Dashboard,
  metadata: DashboardQueryMetadata,
) {
  fetchMock.get(`path:/api/dashboard/${dashboard.id}/query_metadata`, metadata);
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

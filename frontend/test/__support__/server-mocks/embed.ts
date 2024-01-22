import fetchMock from "fetch-mock";

import type { Dashboard } from "metabase-types/api";

export function setupEmbedDashboardEndpoints(
  jwt: string,
  dashboard: Dashboard,
) {
  fetchMock.get(`path:/api/embed/dashboard/${jwt}`, dashboard);
}

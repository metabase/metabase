import fetchMock from "fetch-mock";

import type { Dashboard, DashboardCard } from "metabase-types/api";
import { createMockDataset } from "metabase-types/api/mocks";

export function setupEmbedDashboardEndpoints(
  uuidOrToken: string,
  dashboard: Dashboard,
  dashcards?: DashboardCard[],
) {
  fetchMock.get(`path:/api/embed/dashboard/${uuidOrToken}`, dashboard);

  if (dashcards) {
    dashcards.forEach(({ id, card_id }) => {
      fetchMock.get(
        `path:/api/embed/dashboard/${uuidOrToken}/dashcard/${id}/card/${card_id}`,
        createMockDataset(),
      );
    });
  }
}

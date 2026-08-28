import fetchMock from "fetch-mock";

import type {
  Card,
  Dashboard,
  DashboardCard,
  Dataset,
} from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";
import { createMockDataset } from "metabase-types/api/mocks";

export function setupEmbedDashboardEndpoints(
  uuidOrToken: EntityToken,
  dashboard: Dashboard,
  dashcards?: DashboardCard[],
  dataset: Dataset = createMockDataset(),
) {
  fetchMock.get(`path:/api/embed/dashboard/${uuidOrToken}`, dashboard);

  if (dashcards) {
    dashcards.forEach(({ id, card_id }) => {
      fetchMock.get(
        `path:/api/embed/dashboard/${uuidOrToken}/dashcard/${id}/card/${card_id}`,
        dataset,
      );
    });
  }
}

export function setupEmbeddableEntitiesEndpoints({
  dashboards = [],
  cards = [],
}: {
  dashboards: Dashboard[];
  cards: Card[];
}) {
  fetchMock.get("path:/api/dashboard/embeddable", dashboards);
  fetchMock.get("path:/api/card/embeddable", cards);
}

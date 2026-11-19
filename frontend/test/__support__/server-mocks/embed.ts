import fetchMock from "fetch-mock";

import type {
  Card,
  Dashboard,
  DashboardCard,
  EmbedDataset,
} from "metabase-types/api";
import type { EntityToken, EntityUuid } from "metabase-types/api/entity";
import { createMockDataset } from "metabase-types/api/mocks";

export function setupEmbedDashboardEndpoints(
  uuidOrToken: EntityToken,
  dashboard: Dashboard,
  dashcards?: DashboardCard[],
  // the static embedding modal's preview serves the same endpoints under `/api/preview_embed`
  { basePath = "/api/embed" }: { basePath?: string } = {},
) {
  fetchMock.get(`path:${basePath}/dashboard/${uuidOrToken}`, dashboard);

  if (dashcards) {
    dashcards.forEach(({ id, card_id }) => {
      fetchMock.get(
        `path:${basePath}/dashboard/${uuidOrToken}/dashcard/${id}/card/${card_id}`,
        createMockDataset(),
      );
    });
  }
}

export function setupEmbedQuestionEndpoints(
  token: EntityToken,
  card: Card,
  dataset: EmbedDataset,
) {
  fetchMock.get(`path:/api/embed/card/${token}`, card);
  fetchMock.get(`path:/api/embed/card/${token}/query`, dataset);
}

export function setupEmbedPreviewQuestionEndpoints(
  token: EntityToken,
  card: Card,
  dataset: EmbedDataset,
) {
  fetchMock.get(`path:/api/preview_embed/card/${token}`, card);
  fetchMock.get(`path:/api/preview_embed/card/${token}/query`, dataset);
}

export function setupPublicDashboardEndpoint(
  uuid: EntityUuid,
  dashboard: Dashboard,
) {
  fetchMock.get(`path:/api/public/dashboard/${uuid}`, dashboard);
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

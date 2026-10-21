import fetchMock from "fetch-mock";

import type {
  Card,
  Dashboard,
  DashboardCard,
  EmbedDataset,
  FieldValue,
  ParameterId,
  PublicCard,
} from "metabase-types/api";
import type { EntityToken, EntityUuid } from "metabase-types/api/entity";
import { createMockDataset } from "metabase-types/api/mocks";

export function setupEmbedDashboardEndpoints(
  uuidOrToken: EntityToken,
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

export function setupEmbedCardEndpoints(
  token: EntityToken,
  card: PublicCard,
  dataset: EmbedDataset,
) {
  fetchMock.get(`path:/api/embed/card/${token}`, card);
  fetchMock.get(`path:/api/embed/card/${token}/query`, dataset);
}

export function setupEmbedDashboardParameterRemappingEndpoint(
  token: EntityToken,
  parameterId: ParameterId,
  remapping: FieldValue,
) {
  fetchMock.get(
    `path:/api/embed/dashboard/${token}/params/${parameterId}/remapping`,
    remapping,
  );
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

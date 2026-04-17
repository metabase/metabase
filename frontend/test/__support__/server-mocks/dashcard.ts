import fetchMock from "fetch-mock";

import type { DashboardId, Dataset } from "metabase-types/api";
import type { StoreDashcard } from "metabase-types/store";

export function setupDashcardQueryEndpoints(
  dashboardId: DashboardId,
  dashcard: StoreDashcard,
  dataset: Dataset,
) {
  fetchMock.post(
    `path:/api/dashboard/${dashboardId}/dashcard/${dashcard.id}/card/${dashcard.card_id}/query`,
    dataset,
  );
}

import fetchMock from "fetch-mock";

import type { StoreDashcard } from "metabase/redux/store";
import type { DashboardId, Dataset } from "metabase-types/api";

export function setupDashcardQueryEndpoints(
  dashboardId: DashboardId,
  dashcard: StoreDashcard,
  // A promise holds the response until the test resolves it
  dataset: Dataset | Promise<Dataset>,
) {
  fetchMock.post(
    `path:/api/dashboard/${dashboardId}/dashcard/${dashcard.id}/card/${dashcard.card_id}/query`,
    dataset,
  );
}

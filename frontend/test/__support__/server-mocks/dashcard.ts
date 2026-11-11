import fetchMock from "fetch-mock";

import type { StoreDashcard } from "metabase/redux/store";
import type { DashboardId, Dataset } from "metabase-types/api";

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

export function setupDashcardQueryErrorEndpoint(
  dashboardId: DashboardId,
  dashcard: StoreDashcard,
  {
    status = 500,
    message = "some error",
  }: { status?: number; message?: string } = {},
) {
  fetchMock.post(
    `path:/api/dashboard/${dashboardId}/dashcard/${dashcard.id}/card/${dashcard.card_id}/query`,
    { status, body: { cause: message, data: {}, message } },
  );
}

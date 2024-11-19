import type {
  CardId,
  Dashboard,
  DashboardCard,
  DashboardId,
} from "metabase-types/api";

import { DEFAULT_CARD } from "./updateDashboardCards";

export function addOrUpdateDashboardCard({
  card_id,
  dashboard_id,
  card,
}: {
  card_id: CardId;
  dashboard_id: DashboardId;
  card: Partial<DashboardCard>;
}): Cypress.Chainable<Cypress.Response<DashboardCard>> {
  return cy
    .request<Dashboard>("PUT", `/api/dashboard/${dashboard_id}`, {
      dashcards: [
        {
          ...DEFAULT_CARD,
          card_id,
          ...card,
        },
      ],
    })
    .then(response => ({
      ...response,
      body: response.body.dashcards[0],
    }));
}

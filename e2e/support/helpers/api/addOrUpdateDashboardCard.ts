import type {
  CardId,
  DashboardCard,
  DashboardId,
  UpdateDashboardCardRequest,
} from "metabase-types/api";

import { updateDashboard } from "./updateDashboard";
import { DEFAULT_CARD } from "./updateDashboardCards";

export function addOrUpdateDashboardCard({
  card_id,
  dashboard_id,
  card,
}: {
  card_id: CardId;
  dashboard_id: DashboardId;
  card: Partial<UpdateDashboardCardRequest>;
}): Cypress.Chainable<Cypress.Response<DashboardCard>> {
  return updateDashboard({
    id: dashboard_id,
    dashcards: [
      {
        ...DEFAULT_CARD,
        card_id,
        ...card,
      },
    ],
  }).then((response) => ({
    ...response,
    body: response.body.dashcards[0],
  }));
}

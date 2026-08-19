import type {
  Dashboard,
  DashboardId,
  UpdateDashboardCardRequest,
} from "metabase-types/api";

import { updateDashboard } from "./updateDashboard";

export const DEFAULT_CARD = {
  id: -1,
  row: 0,
  col: 0,
  size_x: 11,
  size_y: 8,
  visualization_settings: {},
  parameter_mappings: [],
};

/**
 * Replaces all the cards on a dashboard with the array given in the `cards` parameter.
 * Can be used to remove cards (exclude from array), or add/update them.
 */
export function updateDashboardCards({
  dashboard_id,
  cards,
}: {
  dashboard_id: DashboardId;
  cards: Partial<UpdateDashboardCardRequest>[];
}): Cypress.Chainable<Cypress.Response<Dashboard>> {
  let id = -1;
  return updateDashboard({
    id: dashboard_id,
    dashcards: cards.map((card) => ({
      ...DEFAULT_CARD,
      id: id--,
      ...card,
    })),
  });
}

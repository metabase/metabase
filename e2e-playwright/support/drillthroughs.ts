/**
 * Helpers for the drillthrough spec ports (dash-drill): ports of
 * H.dashboardGrid and H.addOrUpdateDashboardCard, plus the spec-local
 * helpers from dash_drill.cy.spec.js.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { visitDashboard } from "./ui";

/** Port of H.dashboardGrid (e2e-dashboard-helpers.ts). */
export function dashboardGrid(page: Page): Locator {
  return page.getByTestId("dashboard-grid");
}

/** Port of DEFAULT_CARD from e2e/support/helpers/api/updateDashboardCards.ts. */
const DEFAULT_CARD = {
  id: -1,
  row: 0,
  col: 0,
  size_x: 11,
  size_y: 8,
  visualization_settings: {},
  parameter_mappings: [],
};

/** Port of H.addOrUpdateDashboardCard (api/addOrUpdateDashboardCard.ts). */
export async function addOrUpdateDashboardCard(
  api: MetabaseApi,
  {
    card_id,
    dashboard_id,
    card = {},
  }: {
    card_id: number;
    dashboard_id: number;
    card?: Record<string, unknown>;
  },
) {
  await api.put(`/api/dashboard/${dashboard_id}`, {
    dashcards: [{ ...DEFAULT_CARD, card_id, ...card }],
  });
}

/**
 * Like api.createDashboard but accepting arbitrary dashboard fields
 * (e.g. parameters), which the typed api.ts helper doesn't take.
 */
export async function createDashboardWithDetails(
  api: MetabaseApi,
  details: Record<string, unknown> & { name?: string },
): Promise<{ id: number }> {
  const { name = "Test Dashboard", ...rest } = details;
  const response = await api.post("/api/dashboard", { name, ...rest });
  return (await response.json()) as { id: number };
}

/** Port of the spec-local addCardToNewDashboard from dash_drill.cy.spec.js. */
export async function addCardToNewDashboard(
  page: Page,
  api: MetabaseApi,
  dashboardName: string,
  cardId: number,
): Promise<number> {
  const { id: dashboardId } = await api.createDashboard({
    name: dashboardName,
  });
  await addOrUpdateDashboardCard(api, {
    card_id: cardId,
    dashboard_id: dashboardId,
  });
  await visitDashboard(page, api, dashboardId);
  return dashboardId;
}

/**
 * Port of the spec-local clickScalarCardTitle from dash_drill.cy.spec.js:
 * the scalar card title inside the dashboard grid navigates to the question.
 */
export async function clickScalarCardTitle(page: Page, cardName: string) {
  await dashboardGrid(page).getByText(cardName, { exact: true }).click();
}

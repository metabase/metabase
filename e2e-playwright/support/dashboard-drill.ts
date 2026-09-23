/**
 * Helpers for the dashboard-drill spec port
 * (e2e/test/scenarios/dashboard-cards/dashboard-drill.cy.spec.js).
 *
 * These are the spec-local factory functions and small UI helpers the Cypress
 * original defined at module scope. New file per the porting rules (parallel
 * agents never edit shared support modules — import from them instead).
 *
 * Notes on the ports:
 * - The Cypress `createQuestion` posts a NATIVE question ("select 111 as
 *   my_number, 'foo' as my_string") — mapped onto the shared
 *   `createNativeQuestion` factory (same POST /api/card shape).
 * - `H.sidebar()` is `cy.get("main aside")` (e2e-ui-elements-helpers.js), the
 *   click-behavior sidebar in a dashboard's edit mode — NOT the `sidebar-right`
 *   testid. Mirrored as `sidebar(page)` here.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { addOrUpdateDashboardCard } from "./dashboard-management";
import { createDashboard, createNativeQuestion } from "./factories";
import { SAMPLE_DATABASE } from "./sample-data";
import { caseSensitiveSubstring as caseSensitive } from "./text";
import { dashboardParametersPopover } from "./click-behavior";

const { ORDERS, PEOPLE } = SAMPLE_DATABASE;

/** Port of H.sidebar (e2e-ui-elements-helpers.js): `cy.get("main aside")`. */
export function sidebar(page: Page) {
  return page.locator("main aside");
}

/**
 * Port of the spec-local `createQuestion(options, callback)`: POST a native
 * question, returning the new card id. Defaults to the two-column probe query
 * the spec's click-through tests rely on.
 */
export async function createDrillQuestion(
  api: MetabaseApi,
  options: {
    query?: string;
    visualization_settings?: Record<string, unknown>;
  } = {},
): Promise<number> {
  const card = await createNativeQuestion(api, {
    name: "Question",
    display: "table",
    collection_id: null,
    native: {
      query: options.query || "select 111 as my_number, 'foo' as my_string",
    },
    visualization_settings: options.visualization_settings || {},
  });
  return card.id;
}

/**
 * Port of the spec-local `createDashboard(...)`: create a dashboard, add a
 * "My Param" category filter, and attach the given card with My Param mapped to
 * PEOPLE.NAME (via ORDERS.USER_ID). Returns the dashboard id.
 */
export async function createDrillDashboard(
  api: MetabaseApi,
  {
    dashboardName = "dashboard",
    questionId,
    visualization_settings,
  }: {
    dashboardName?: string;
    questionId: number;
    visualization_settings?: Record<string, unknown>;
  },
): Promise<number> {
  const dashboard = await createDashboard(api, { name: dashboardName });
  await api.put(`/api/dashboard/${dashboard.id}`, {
    parameters: [
      { name: "My Param", slug: "my_param", id: "e8f79be9", type: "category" },
    ],
  });
  await addOrUpdateDashboardCard(api, {
    card_id: questionId,
    dashboard_id: dashboard.id,
    card: {
      parameter_mappings: [
        {
          parameter_id: "e8f79be9",
          card_id: questionId,
          target: [
            "dimension",
            ["field", PEOPLE.NAME, { "source-field": ORDERS.USER_ID }],
          ],
        },
      ],
      visualization_settings,
    },
  });
  return dashboard.id;
}

/** Port of the spec-local `createDashboardWithQuestion`. */
export async function createDashboardWithQuestion(
  api: MetabaseApi,
  { dashboardName = "dashboard" }: { dashboardName?: string } = {},
): Promise<number> {
  const questionId = await createDrillQuestion(api, {});
  return createDrillDashboard(api, { dashboardName, questionId });
}

/**
 * Port of the spec-local `setParamValue(paramName, text)`: wait to leave edit
 * mode, open the param widget and add the typed value. The value box is a
 * "Search the list" typeahead, so type with real keystrokes (PORTING rule 5).
 */
export async function setParamValue(page: Page, paramName: string, text: string) {
  await expect(page.getByText("You're editing this dashboard.")).toHaveCount(0);
  await page.getByText(paramName, { exact: true }).click();
  const paramPopover = dashboardParametersPopover(page);
  await paramPopover.getByPlaceholder("Search the list").pressSequentially(text);
  await paramPopover.getByText("Add filter", { exact: true }).click();
}

/**
 * Port of the spec-local `drillThroughCardTitle(title)`: click the card's
 * legend caption (cy.contains → case-sensitive substring) and assert the QB
 * shows "Started from <title>".
 */
export async function drillThroughCardTitle(page: Page, title: string) {
  await page
    .getByTestId("legend-caption")
    .filter({ hasText: caseSensitive(title) })
    .first()
    .getByTestId("legend-caption-title")
    .click();
  await expect(
    page.getByText(caseSensitive(`Started from ${title}`)).first(),
  ).toBeVisible();
}

/**
 * Helpers for the dashboard-filter-data-permissions spec port
 * (dashboard-filters/dashboard-filter-data-permissions.cy.spec.js).
 *
 * New helpers live here (parallel-agent rule: no edits to shared modules).
 * Everything else the spec needs is imported from existing support modules
 * (dashboard, dashboard-parameters, ui).
 */
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { filterWidget } from "./dashboard-parameters";
import { ORDERS_DASHBOARD_ID } from "./sample-data";
import { popover, visitDashboard } from "./ui";

/**
 * Port of the spec-local `filterDashboard(suggests = true)`: open the Orders
 * dashboard, open the "Text" filter widget, pick a filter value, apply it, and
 * assert the applied value shows on the widget.
 *
 * The `suggests` branch mirrors the original: when a user has data access the
 * widget returns suggestions to click; when it does not, the search request
 * 403s. Both tests in this spec exercise `suggests: true` (the point of
 * metabase#8472 is that even a nodata user gets suggestions), so the
 * `suggests: false` branch is dead in the current spec but ported for fidelity.
 *
 * The Cypress original registered `cy.wait("@search")` against an alias that was
 * never actually created — a typo folded `.as("search")` into the intercept URL
 * string, so the alias never existed. The 403-wait below is registered properly
 * with waitForResponse (rule 2).
 */
export async function filterDashboard(
  page: Page,
  api: MetabaseApi,
  { suggests = true }: { suggests?: boolean } = {},
) {
  await visitDashboard(page, api, ORDERS_DASHBOARD_ID);
  // cy.contains("Orders") — wait for the dashboard to render.
  await expect(page.getByText(/Orders/).first()).toBeVisible();
  // cy.contains("Text").click() — open the text filter widget's value dropdown.
  await filterWidget(page, { name: "Text" }).click();

  const pop = popover(page).first();
  const search = pop.getByPlaceholder("Search the list", { exact: true });
  await search.click();

  if (suggests) {
    await search.pressSequentially("Main Street");
    await pop.getByText("100 Main Street", { exact: true }).click();
  } else {
    const searchResponse = page.waitForResponse((response) =>
      /\/api\/dashboard\/\d+\/params\/[^/]+\/search\//.test(
        new URL(response.url()).pathname,
      ),
    );
    await search.pressSequentially("100 Main Street");
    await search.blur();
    const response = await searchResponse;
    expect(response.status()).toBe(403);
  }

  await pop
    .getByRole("button", { name: "Add filter", exact: true })
    .click({ force: true });

  // cy.contains("100 Main Street") — the applied value shows on the widget.
  await expect(page.getByText("100 Main Street").first()).toBeVisible();
}

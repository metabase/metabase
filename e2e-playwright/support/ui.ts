/**
 * Ports of the `H` UI helpers used by the navbar spec
 * (e2e/support/helpers/e2e-ui-elements-helpers.js and e2e-misc-helpers.js).
 * Each helper takes the Page and returns a Locator, mirroring the Cypress
 * helpers that return chainables.
 */
import { Locator, Page, expect } from "@playwright/test";

import type { MetabaseApi } from "./api";

const POPOVER_SELECTOR =
  ".popover[data-state~='visible'],[data-element-id=mantine-popover]";

/**
 * Matches all visible popovers (like the Cypress helper). With a single
 * popover open, chaining works directly; when two coexist (e.g. a filter
 * widget with a typeahead dropdown) disambiguate with .first()/.last().
 */
export function popover(page: Page): Locator {
  return page.locator(POPOVER_SELECTOR).filter({ visible: true });
}

export function navigationSidebar(page: Page): Locator {
  return page.getByTestId("main-navbar-root");
}

export function appBar(page: Page): Locator {
  return page.getByLabel("Navigation bar");
}

export function newButton(page: Page): Locator {
  return page.getByTestId("app-bar").getByRole("button", { name: "New" });
}

export function collectionTable(page: Page): Locator {
  return page.getByTestId("collection-table");
}

export function queryBuilderHeader(page: Page): Locator {
  return page.getByTestId("qb-header");
}

export async function assertNavigationSidebarItemSelected(
  page: Page,
  name: string | RegExp,
  value = "true",
) {
  await expect(
    navigationSidebar(page).getByRole("treeitem", { name }),
  ).toHaveAttribute("aria-selected", value);
}

/**
 * The sidebar sections use a literal role="section" attribute — not a valid
 * ARIA role, so Playwright's getByRole engine can't match it. Cypress
 * testing-library tolerated it; here we fall back to an attribute selector.
 */
export function sidebarSection(page: Page, name: string): Locator {
  return navigationSidebar(page).locator(
    `[role="section"][aria-label="${name}"]`,
  );
}

export async function assertNavigationSidebarBookmarkSelected(
  page: Page,
  name: string | RegExp,
  value = "true",
) {
  await expect(
    sidebarSection(page, "Bookmarks").getByRole("listitem", { name }),
  ).toHaveAttribute("aria-selected", value);
}

/**
 * Port of openNavigationSidebar's self-healing open loop: navigating to a
 * dashboard/question collapses the navbar, and the collapse can land a beat
 * after page content renders, so re-check after acting.
 */
export async function openNavigationSidebar(page: Page) {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await navigationSidebar(page).isVisible()) {
      break;
    }
    await appBar(page).getByTestId("sidebar-toggle").click();
    await page.waitForTimeout(100);
  }
  await expect(navigationSidebar(page)).toBeVisible();
}

/**
 * Port of H.visitQuestion: navigate and wait for the metadata + query
 * responses. Note the Playwright inversion — waits are registered *before*
 * the navigation that triggers them.
 */
export async function visitQuestion(page: Page, id: number) {
  const metadataResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.match(
        new RegExp(`^/api/card/.*${id}/query_metadata$`),
      ) !== null,
  );
  const queryResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.match(
        new RegExp(`^/api/card/.*\\b${id}/query$`),
      ) !== null,
  );
  await page.goto(`/question/${id}`);
  await Promise.all([metadataResponse, queryResponse]);
}

/**
 * Port of H.visitDashboard: look up the dashboard through the API as the
 * current user, then wait for every first-tab dashcard query to complete.
 */
export async function visitDashboard(
  page: Page,
  api: MetabaseApi,
  dashboardId: number,
) {
  const { status, body } = await api.getDashboard(dashboardId);
  const canView = status === 200;

  const dashcards: {
    id: number;
    card_id: number | null;
    dashboard_tab_id: number | null;
    card: { display?: string };
  }[] = body.dashcards ?? [];

  const firstTabId: number | null = body.tabs?.length ? body.tabs[0].id : null;
  const cardQueries = dashcards
    .filter((dashcard) => dashcard.card_id != null)
    .filter(
      (dashcard) =>
        firstTabId == null || dashcard.dashboard_tab_id === firstTabId,
    )
    .map((dashcard) => {
      const base =
        dashcard.card.display === "pivot"
          ? `/api/dashboard/pivot/${dashboardId}`
          : `/api/dashboard/${dashboardId}`;
      return `${base}/dashcard/${dashcard.id}/card/${dashcard.card_id}/query`;
    });

  const waits = canView
    ? cardQueries.map((path) =>
        page.waitForResponse(
          (response) => new URL(response.url()).pathname === path,
        ),
      )
    : [];

  await page.goto(`/dashboard/${dashboardId}`);
  await Promise.all(waits);
}

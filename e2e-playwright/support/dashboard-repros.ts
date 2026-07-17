/**
 * Helpers for the dashboard-reproductions spec port. New helpers live here
 * (parallel-agent rule: no edits to shared modules). Ports of:
 * - H.assertTabSelected / H.openDashboardSettingsSidebar /
 *   H.closeDashboardSettingsSidebar / H.clickBehaviorSidebar
 *   (e2e-dashboard-helpers.ts)
 * - cy.updatePermissionsGraph (e2e/support/commands/permissions/
 *   updatePermissions.ts) and cy.sandboxTable (sandboxTable.ts)
 * - the parameter-mapping GET+PUT boilerplate repeated by issues 42165,
 *   54353, 52674 and 58556 (addParameterMappingToFirstDashcard)
 * - network shims for the cy.intercept patterns the spec uses:
 *   gateResponses (res.setDelay(99999) / setThrottle — hold responses until
 *   released) and delayResponses (res.setDelay(n) — fixed delay, removable
 *   like the spec's restoreDashcardQuery).
 */
import { expect } from "@playwright/test";
import type { Locator, Page, Response, Route } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { getDashboardCard } from "./dashboard";
import { showDashboardCardActions } from "./dashboard-cards";
import { dashboardHeader } from "./dashboard";
import { sidesheet } from "./revisions";
import { popover } from "./ui";

// === user groups (mirrors USER_GROUPS in e2e/support/cypress_data.js) ===

export const ALL_USERS_GROUP = 1;
export const COLLECTION_GROUP = 5;

// === UI helpers ===

/** Port of H.assertTabSelected. */
export async function assertTabSelected(page: Page, tabName: string) {
  await expect(
    page.getByRole("tab", { name: tabName, exact: true }),
  ).toHaveAttribute("aria-selected", "true");
}

/** Port of H.openDashboardSettingsSidebar. */
export async function openDashboardSettingsSidebar(page: Page) {
  await dashboardHeader(page).locator(".Icon-ellipsis").click();
  await popover(page).getByText("Edit settings", { exact: true }).click();
}

/** Port of H.closeDashboardSettingsSidebar. */
export async function closeDashboardSettingsSidebar(page: Page) {
  await sidesheet(page).getByLabel("Close", { exact: true }).click();
}

/**
 * Port of H.clickBehaviorSidebar(dashcardIndex): hover the card, click its
 * "Click behavior" action, return the sidebar locator.
 */
export async function clickBehaviorSidebar(
  page: Page,
  dashcardIndex = 0,
): Promise<Locator> {
  await showDashboardCardActions(page, dashcardIndex);
  await getDashboardCard(page, dashcardIndex)
    .getByLabel("Click behavior")
    .click({ force: true });
  return page.getByTestId("click-behavior-sidebar");
}

/**
 * Count the elements a locator matches that are NOT transparent.
 *
 * Cypress's `:visible` treats `opacity: 0` as hidden; Playwright's
 * `{ visible: true }` ignores opacity entirely (it checks for a non-empty
 * bounding box and `visibility`). Elements revealed by an opacity transition
 * — dashcard action panels are rendered for every card in edit mode and faded
 * in by a `:hover` rule — therefore match `{ visible: true }` on every card.
 * This is the faithful equivalent of Cypress's `.filter(":visible")` for them.
 */
export function countOpaqueElements(locator: Locator): Promise<number> {
  return locator.evaluateAll(
    (elements) =>
      elements.filter((element) => getComputedStyle(element).opacity !== "0")
        .length,
  );
}

// === permissions (ports of the Cypress custom commands) ===

/** Port of cy.updatePermissionsGraph: GET the graph, merge, PUT it back. */
export async function updatePermissionsGraph(
  api: MetabaseApi,
  groupsPermissionsObject: Record<string, unknown>,
) {
  const response = await api.get("/api/permissions/graph");
  const { groups, revision } = (await response.json()) as {
    groups: Record<string, unknown>;
    revision: number;
  };
  await api.put("/api/permissions/graph", {
    groups: { ...groups, ...groupsPermissionsObject },
    revision,
  });
}

/**
 * Port of cy.sandboxTable: look up the table's schema/db, grant the group
 * sandboxed view-data on it, then create the GTAP.
 */
export async function sandboxTable(
  api: MetabaseApi,
  {
    table_id,
    attribute_remappings = {},
    card_id = null,
    group_id = COLLECTION_GROUP,
  }: {
    table_id: number;
    attribute_remappings?: Record<string, unknown>;
    card_id?: number | null;
    group_id?: number;
  },
) {
  const tables = (await (await api.get("/api/table")).json()) as {
    id: number;
    schema: string;
    db_id: number;
  }[];
  const table = tables.find((table) => table.id === table_id);
  if (!table) {
    throw new Error(`Table ${table_id} not found`);
  }
  await updatePermissionsGraph(api, {
    [group_id]: {
      [table.db_id]: {
        "view-data": { [table.schema]: { [table_id]: "sandboxed" } },
        "create-queries": "query-builder",
      },
    },
  });
  await api.post("/api/mt/gtap", {
    attribute_remappings,
    card_id,
    group_id,
    table_id,
  });
}

// === parameter mapping boilerplate ===

/**
 * The GET dashboard → PUT dashcards[0].parameter_mappings dance that issues
 * 42165, 54353, 52674, 58556 all inline: connect the dashboard's first
 * parameter to its first dashcard with the given target.
 */
export async function addParameterMappingToFirstDashcard(
  api: MetabaseApi,
  dashboardId: number,
  target: unknown[],
) {
  const dashboard = (await (
    await api.get(`/api/dashboard/${dashboardId}`)
  ).json()) as {
    dashcards: ({ card_id: number } & Record<string, unknown>)[];
    parameters: { id: string }[];
  };
  const [dashcard] = dashboard.dashcards;
  const [parameter] = dashboard.parameters;
  await api.put(`/api/dashboard/${dashboardId}`, {
    dashcards: [
      {
        ...dashcard,
        parameter_mappings: [
          {
            card_id: dashcard.card_id,
            parameter_id: parameter.id,
            target,
          },
        ],
      },
    ],
  });
}

// === network shims ===

/** POST /api/dashboard/:id/dashcard/:id/card/:id/query. */
export const DASHCARD_QUERY_PATH =
  /^\/api\/dashboard\/\d+\/dashcard\/\d+\/card\/\d+\/query$/;

/** POST /api/card/:id/query. */
export const CARD_QUERY_PATH = /^\/api\/card\/\d+\/query$/;

export function isDashcardQueryResponse(response: Response): boolean {
  return (
    response.request().method() === "POST" &&
    DASHCARD_QUERY_PATH.test(new URL(response.url()).pathname)
  );
}

/** Register BEFORE the triggering action; await after. */
export function waitForDashcardQuery(page: Page): Promise<Response> {
  return page.waitForResponse(isDashcardQueryResponse);
}

/**
 * Hold every matching request until release() is called (the Playwright
 * equivalent of the spec's res.setDelay(99999) / setThrottle intercepts).
 * count() reports how many matching requests were attempted — the stand-in
 * for cy.get("@alias.all").should("have.length", n) on stalled aliases.
 */
export async function gateResponses(
  page: Page,
  pathPattern: RegExp,
  method = "POST",
): Promise<{ release: () => void; count: () => number }> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let count = 0;
  await page.route(
    (url) => pathPattern.test(url.pathname),
    async (route: Route) => {
      if (route.request().method() !== method) {
        return route.fallback();
      }
      count += 1;
      await gate;
      // The page may already be closing (tests that never release), or the
      // request may have been aborted client-side — both are fine.
      await route.continue().catch(() => {});
    },
  );
  return { release, count: () => count };
}

/**
 * Delay every matching request by delayMs (the spec's res.setDelay(n)).
 * Returns a stop() that removes the delay, like restoreDashcardQuery's
 * pass-through re-intercept.
 */
export async function delayResponses(
  page: Page,
  pathPattern: RegExp,
  delayMs: number,
  method = "POST",
): Promise<() => Promise<void>> {
  const matcher = (url: URL) => pathPattern.test(url.pathname);
  const handler = async (route: Route) => {
    if (route.request().method() !== method) {
      return route.fallback();
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.continue().catch(() => {});
  };
  await page.route(matcher, handler);
  return () => page.unroute(matcher, handler);
}

/**
 * Helpers for the dashboard-core spec port (dashboard.cy.spec.js): ports of
 * the H dashboard helpers no earlier port needed — iframe cards, tabs,
 * dashboard width assertions, text-card factories, updateDashboardCards —
 * plus local stand-ins for the metabase-types mocks the Cypress spec
 * imports (createMockVirtualCard / createMockVirtualDashCard) and the
 * sample-instance-data ids that sample-data.ts doesn't expose yet.
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import type { MetabaseApi } from "./api";
import { getDashboardCard, selectDropdown } from "./dashboard";
import { icon } from "./dashboard-cards";
import { createDashboardWithTabs as createDashboardWithTabsFactory } from "./factories";
import { visitQuestionAdhoc } from "./permissions";
import { LOGIN_CACHE, SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";
import type { UserName } from "./sample-data";
import { popover } from "./ui";

// === sample instance data lookups (cypress_sample_instance_data.js) ===

const ordersDashboard = SAMPLE_INSTANCE_DATA.dashboards.find(
  (dashboard) => dashboard.name === "Orders in a dashboard",
);
if (!ordersDashboard) {
  throw new Error(
    'Dashboard "Orders in a dashboard" not found in cypress_sample_instance_data',
  );
}

export const ORDERS_DASHBOARD_ENTITY_ID = ordersDashboard.entity_id;
export const ORDERS_DASHBOARD_DASHCARD_ID = ordersDashboard.dashcards[0].id;

/**
 * metabase/utils/dashboard_grid GRID_WIDTH — the repo import is outside
 * this project's tsconfig include, so the constant is inlined.
 */
export const GRID_WIDTH = 24;

/**
 * The harness signIn is typed to the USERS credential map, but its login
 * cache lookup handles any snapshot-cached user (e.g. "nocollection");
 * widen deliberately after checking the cache actually has the user.
 */
export function cachedUserName(name: string): UserName {
  if (!(name in LOGIN_CACHE)) {
    throw new Error(`No cached session for user "${name}" in the login cache`);
  }
  return name as UserName;
}

// === API helpers ===

/** DEFAULT_CARD from e2e/support/helpers/api/updateDashboardCards.ts. */
const DEFAULT_CARD = {
  id: -1,
  row: 0,
  col: 0,
  size_x: 11,
  size_y: 8,
  visualization_settings: {},
  parameter_mappings: [],
};

/**
 * Port of H.updateDashboardCards: replaces all the cards on a dashboard
 * with the given array.
 */
export async function updateDashboardCards(
  api: MetabaseApi,
  {
    dashboard_id,
    cards,
  }: { dashboard_id: number; cards: Record<string, unknown>[] },
) {
  let id = -1;
  await api.put(`/api/dashboard/${dashboard_id}`, {
    dashcards: cards.map((card) => ({ ...DEFAULT_CARD, id: id--, ...card })),
  });
}

/** Port of H.createCollection (api/createCollection.ts), the subset used here. */
export async function createCollection(
  api: MetabaseApi,
  { name, parent_id = null }: { name: string; parent_id?: number | null },
): Promise<{ id: number }> {
  const response = await api.post("/api/collection", { name, parent_id });
  return (await response.json()) as { id: number };
}

export type DashboardWithTabs = {
  id: number;
  entity_id: string;
  tabs: { id: number; name: string; entity_id: string }[];
  dashcards: { id: number; visualization_settings?: { text?: string } }[];
};

/**
 * Port of H.createDashboardWithTabs. Delegates to the canonical factory; this
 * spec also reads entity ids / tab ids, so it narrows the factory's generic
 * Dashboard return to DashboardWithTabs.
 */
export async function createDashboardWithTabs(
  api: MetabaseApi,
  options: {
    tabs: { id: number; name: string }[];
    dashcards?: Record<string, unknown>[];
    name?: string;
  } & Record<string, unknown>,
): Promise<DashboardWithTabs> {
  return (await createDashboardWithTabsFactory(
    api,
    options,
  )) as unknown as DashboardWithTabs;
}

/**
 * Port of H.createDashboard({ name, dashcards }) (api/createDashboard.ts):
 * POST the dashboard, then PUT the dashcards and return the full body so
 * callers can read the created dashcard ids.
 */
export async function createDashboardWithCards(
  api: MetabaseApi,
  {
    name = "Test Dashboard",
    dashcards,
  }: { name?: string; dashcards: Record<string, unknown>[] },
): Promise<{
  id: number;
  dashcards: { id: number; visualization_settings?: { text?: string } }[];
}> {
  const created = await api.post("/api/dashboard", { name });
  const dashboard = (await created.json()) as { id: number };
  const updated = await api.put(`/api/dashboard/${dashboard.id}`, {
    dashcards,
  });
  return (await updated.json()) as {
    id: number;
    dashcards: { id: number; visualization_settings?: { text?: string } }[];
  };
}

// === factories (ports of getTextCardDetails and the metabase-types mocks) ===

/** Port of getNextUnsavedDashboardCardId (e2e-dashboard-helpers.ts). */
let nextUnsavedDashboardCardId = 0;

/** Port of H.getTextCardDetails. */
export function getTextCardDetails({
  id = --nextUnsavedDashboardCardId,
  col = 0,
  row = 0,
  size_x = 4,
  size_y = 6,
  text = "Text card",
  ...cardDetails
}: {
  id?: number;
  col?: number;
  row?: number;
  size_x?: number;
  size_y?: number;
  text?: string;
} & Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    card_id: null,
    col,
    row,
    size_x,
    size_y,
    visualization_settings: {
      virtual_card: {
        name: null,
        display: "text",
        visualization_settings: {},
        dataset_query: {},
        archived: false,
      },
      text,
    },
    ...cardDetails,
  };
}

type VirtualCard = {
  name: null;
  display: string;
  visualization_settings: Record<string, unknown>;
  dataset_query: Record<string, unknown>;
  archived: boolean;
};

/** Local stand-in for createMockVirtualCard (metabase-types/api/mocks). */
export function mockVirtualCard(opts: { display: string }): VirtualCard {
  return {
    name: null,
    display: opts.display,
    visualization_settings: {},
    dataset_query: {},
    archived: false,
  };
}

/**
 * Local stand-in for createMockVirtualDashCard: only the fields the
 * dashboard PUT endpoint cares about (positions, tab, mappings, and the
 * virtual_card merged into visualization_settings, as the real mock does).
 */
export function mockVirtualDashCard(opts: {
  id: number;
  dashboard_tab_id?: number;
  col?: number;
  row?: number;
  size_x?: number;
  size_y?: number;
  parameter_mappings?: Record<string, unknown>[];
  card?: VirtualCard;
  visualization_settings?: Record<string, unknown>;
}): Record<string, unknown> {
  const card = opts.card ?? mockVirtualCard({ display: "text" });
  return {
    col: 0,
    row: 0,
    size_x: 1,
    size_y: 1,
    card_id: null,
    parameter_mappings: [],
    ...opts,
    card,
    visualization_settings: {
      ...opts.visualization_settings,
      virtual_card: card,
    },
  };
}

// === dashboard UI helpers ===

/** Port of H.getDashboardCards. */
export function getDashboardCards(page: Page): Locator {
  return page.getByTestId("dashcard-container");
}

/** Port of H.removeDashboardCard (realHover → native hover). */
export async function removeDashboardCard(page: Page, index = 0) {
  const card = getDashboardCard(page, index);
  await card.hover();
  const panel = card.getByTestId("dashboardcard-actions-panel");
  await expect(panel).toBeVisible();
  await icon(panel, "close").click({ force: true });
}

/** Port of H.addIFrameWhileEditing. */
export async function addIFrameWhileEditing(page: Page, embed: string) {
  await page.getByLabel("Add a link or iframe").click();
  await popover(page).getByText("Iframe", { exact: true }).click();
  await page.getByTestId("iframe-card-input").fill(embed);
}

/** Port of H.editIFrameWhileEditing ({selectall} + type → fill). */
export async function editIFrameWhileEditing(
  page: Page,
  dashcardIndex: number,
  embed: string,
) {
  const card = getDashboardCard(page, dashcardIndex);
  await card.hover();
  const panel = card.getByTestId("dashboardcard-actions-panel");
  await expect(panel).toBeVisible();
  await icon(panel, "pencil").click();
  await page.getByTestId("iframe-card-input").fill(embed);
}

/**
 * Port of the spec-local validateIFrame. The Cypress original chains
 * cy.get("iframe") off getDashboardCards(), but cy.get re-queries from the
 * root, so this is a page-wide iframe lookup.
 */
export async function validateIFrame(page: Page, src: string, index = 0) {
  const iframe = page.locator("iframe").nth(index);
  await expect(iframe).toHaveAttribute("src", src);
  await expect(iframe).toHaveAttribute(
    "sandbox",
    "allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts",
  );
  await expect(iframe).not.toHaveAttribute("onload");
}

// === tabs (ports of e2e-dashboard-helpers.ts tab helpers) ===

export async function createNewTab(page: Page) {
  await page.getByLabel("Create new tab").click();
}

export async function deleteTab(page: Page, tabName: string) {
  await page
    .getByRole("tab", { name: tabName, exact: true })
    .getByRole("button")
    .click();
  await popover(page).getByText("Delete", { exact: true }).click();
}

export async function duplicateTab(page: Page, tabName: string) {
  await page
    .getByRole("tab", { name: tabName, exact: true })
    .getByRole("button")
    .click();
  await popover(page).getByText("Duplicate", { exact: true }).click();
}

export async function renameTab(
  page: Page,
  tabName: string,
  newTabName: string,
) {
  await page
    .getByRole("tab", { name: tabName, exact: true })
    .getByRole("button")
    .click();
  await popover(page).getByText("Rename", { exact: true }).click();
  // The rename input takes focus with the old name selected, so typing
  // replaces it (the Cypress helper types straight into the tab).
  await page.keyboard.type(newTabName);
  await page.keyboard.press("Enter");
}

// === dashboard width (ports of assertDashboardFixedWidth/FullWidth) ===

const DASHBOARD_MAX_WIDTH = "1048px";
const FIXED_WIDTH_TEST_IDS = [
  "fixed-width-dashboard-header",
  "fixed-width-dashboard-tabs",
  "fixed-width-filters",
  "dashboard-grid",
];

export async function assertDashboardFixedWidth(page: Page) {
  for (const testId of FIXED_WIDTH_TEST_IDS) {
    await expect(page.getByTestId(testId)).toHaveCSS(
      "max-width",
      DASHBOARD_MAX_WIDTH,
    );
  }
}

export async function assertDashboardFullWidth(page: Page) {
  for (const testId of FIXED_WIDTH_TEST_IDS) {
    const element = page.getByTestId(testId);
    // Guard: not.toHaveCSS passes vacuously while the element is still
    // missing (e.g. right after a reload), so anchor on visibility first.
    await expect(element).toBeVisible();
    await expect(element).not.toHaveCSS("max-width", DASHBOARD_MAX_WIDTH);
  }
}

// === misc ports ===

/** Port of H.mapPinIcon. */
export function mapPinIcon(page: Page): Locator {
  return page.locator(".leaflet-marker-icon");
}

/** Port of H.dashboardParametersPopover. */
export function dashboardParametersPopover(page: Page): Locator {
  return page.getByTestId("parameter-value-dropdown");
}

/** Port of H.openProductsTable (default simple mode, no limit). */
export function openProductsTable(page: Page) {
  return visitQuestionAdhoc(page, {
    dataset_query: {
      database: SAMPLE_DB_ID,
      query: { "source-table": SAMPLE_DATABASE.PRODUCTS_ID },
      type: "query",
    },
  });
}

/**
 * Port of the spec-local dragOnXAxis (mousedown → mousemove(clientX) →
 * mouseup) with real mouse input, which both react-grid-layout dashcards
 * and the dnd-kit tab strip accept.
 */
export async function dragOnXAxis(element: Locator, distance: number) {
  const page = element.page();
  const box = await element.boundingBox();
  if (!box) {
    throw new Error("Cannot drag an element without a bounding box");
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Exceed any drag activation threshold before the real move.
  await page.mouse.move(startX + Math.sign(distance) * 10, startY, {
    steps: 2,
  });
  await page.mouse.move(startX + distance, startY, { steps: 10 });
  // Mirrors the .wait(100) the Cypress helper needed "to avoid flakiness".
  await page.waitForTimeout(100);
  await page.mouse.up();
}

/** Port of the spec-local assertScrollBarExists. */
export async function assertScrollBarExists(page: Page) {
  const { bodyWidth, windowWidth } = await page.evaluate(() => ({
    bodyWidth: document.body.getBoundingClientRect().width,
    windowWidth: window.innerWidth,
  }));
  expect(windowWidth).toBeGreaterThanOrEqual(bodyWidth);
}

/** Port of the spec-local checkOptionsForFilter. */
export async function checkOptionsForFilter(page: Page, filter: string) {
  // Cypress .contains(filter) is first-match substring; exact text keeps
  // "ID" from also matching "ID 1".
  await page
    .getByText("Available filters", { exact: true })
    .locator("..")
    .getByText(filter, { exact: true })
    .click();
  const dropdown = selectDropdown(page);
  await expect(dropdown).toContainText("Columns");
  await expect(dropdown).toContainText("COUNT(*)");
  await expect(dropdown).not.toContainText("Dashboard filters");

  // Get rid of the open popover to be able to select another filter.
  // force: the popover is covering this text.
  await page
    .getByText("Pick one or more filters to update", { exact: true })
    .click({ force: true });
}

/**
 * Port of the cy.spy() intercept pattern: counts PUT /api/dashboard/:id
 * requests from registration onwards; read the count via the returned
 * function.
 */
export function countDashboardUpdates(page: Page): () => number {
  let count = 0;
  page.on("request", (request) => {
    if (
      request.method() === "PUT" &&
      /^\/api\/dashboard\/[^/]+$/.test(new URL(request.url()).pathname)
    ) {
      count++;
    }
  });
  return () => count;
}

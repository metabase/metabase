/**
 * Helpers for the dashboard-filters-reproductions-1 spec port. New helpers
 * live here (parallel-agent rule: no edits to shared modules). Ports of:
 * - api helpers whose shared spike versions type only `{ name }` details:
 *   createDashboard / createQuestionAndDashboard (both accept `parameters`,
 *   `enable_embedding`, ... and return the dashcard like the Cypress
 *   originals), createNativeQuestion (accepts `parameters` + `type`),
 *   updateDashboardCards, editDashboardCard, createDashboardWithQuestions,
 *   setModelMetadata (e2e/support/helpers/api/*,
 *   e2e-models-metadata-helpers.js)
 * - dashboard parameter UI helpers (e2e-ui-elements-helpers.js /
 *   e2e-dashboard-helpers.ts): dashboardParametersPopover,
 *   dashboardParameterSidebar, dashboardParametersContainer,
 *   editingParametersContainer, editingFilterWidget, goToTab
 * - navigation: goToMainApp (e2e-ui-elements-helpers.js),
 *   commandPaletteSearch (e2e-command-palette-helpers.js)
 * - setAdHocFilter (e2e/test/scenarios/native-filters/helpers/
 *   e2e-date-filter-helpers.js), only the branches this spec uses
 * - visitDashboardWithParams (H.visitDashboard's `params` option),
 *   visitEmbeddedDashboard (H.visitEmbeddedPage with `setFilters`)
 * - request bookkeeping: waitForResponseMatching + trackResponses replace the
 *   spec's cy.intercept counting (`cy.get("@alias.all").should("have.length")`)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

import { expect } from "@playwright/test";
import type { Locator, Page, Response } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import type { MetabaseApi } from "./api";
import {
  commandPaletteButton,
  commandPaletteInput,
  getProfileLink,
} from "./command-palette";
import {
  createDashboard,
  createDashboardWithQuestions,
  createNativeQuestion as createNativeQuestionFactory,
  createNativeQuestionAndDashboard,
  createQuestion,
  createQuestionAndDashboard,
} from "./factories";
import { SAMPLE_DB_ID } from "./sample-data";
import { caseSensitiveSubstring } from "./text";
import { popover } from "./ui";

/** The mb fixture surface the embed helper needs. */
type SessionHarness = { api: MetabaseApi; signOut(): Promise<void> };

// === instance data ===

/** Port of ORDERS_DASHBOARD_DASHCARD_ID (cypress_sample_instance_data.js). */
export const ORDERS_DASHBOARD_DASHCARD_ID = (() => {
  const dashboard = SAMPLE_INSTANCE_DATA.dashboards.find(
    (dashboard) => dashboard.name === "Orders in a dashboard",
  );
  if (!dashboard) {
    throw new Error("Orders in a dashboard not found in instance data");
  }
  return dashboard.dashcards[0].id;
})();

// === api helpers ===

type DashboardDetails = { name?: string } & Record<string, unknown>;

export type StructuredQuestionDetails = {
  name?: string;
  type?: string;
  display?: string;
  database?: number;
  collection_id?: number;
  visualization_settings?: Record<string, unknown>;
  query: Record<string, unknown>;
};

export type NativeQuestionDetails = {
  name?: string;
  type?: string;
  display?: string;
  database?: number;
  parameters?: unknown[];
  native: Record<string, unknown>;
};

export type DashCard = {
  id: number;
  card_id: number;
  dashboard_id: number;
} & Record<string, unknown>;

// createDashboard / createQuestion / createQuestionAndDashboard /
// createNativeQuestionAndDashboard / createDashboardWithQuestions are now
// canonical in ./factories; re-exported so this module's consumers keep their
// imports unchanged.
export {
  createDashboard,
  createDashboardWithQuestions,
  createNativeQuestionAndDashboard,
  createQuestion,
  createQuestionAndDashboard,
};

/**
 * Port of H.createNativeQuestion — accepts `parameters` and `type`. Delegates to
 * the canonical factory but preserves this module's historical default name
 * ("native", vs the factory's "test question") so consumers that omit `name`
 * still get the same card name.
 */
export async function createNativeQuestion(
  api: MetabaseApi,
  details: NativeQuestionDetails,
): Promise<{ id: number }> {
  return createNativeQuestionFactory(api, { name: "native", ...details });
}

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

/** Port of H.updateDashboardCards: replaces all dashcards with `cards`. */
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

/** Port of H.editDashboardCard (api/editDashboardCard.ts). */
export async function editDashboardCard(
  api: MetabaseApi,
  dashboardCard: DashCard,
  updatedProperties: Record<string, unknown>,
) {
  const { created_at, updated_at, ...cleanCard } = dashboardCard;
  void created_at;
  void updated_at;
  await api.put(`/api/dashboard/${dashboardCard.dashboard_id}`, {
    dashcards: [{ ...cleanCard, ...updatedProperties }],
  });
}

/** Port of H.setModelMetadata (e2e-models-metadata-helpers.js). */
export async function setModelMetadata(
  api: MetabaseApi,
  modelId: number,
  callback: (field: Record<string, unknown>) => Record<string, unknown>,
) {
  const card = (await (await api.get(`/api/card/${modelId}`)).json()) as {
    result_metadata: Record<string, unknown>[];
  };
  await api.put(`/api/card/${modelId}`, {
    result_metadata: card.result_metadata.map(callback),
  });
}

// === dashboard parameter UI helpers ===

/** Port of H.dashboardParametersPopover (popover with a dedicated testid). */
export function dashboardParametersPopover(page: Page): Locator {
  return page.getByTestId("parameter-value-dropdown");
}

/** Port of H.dashboardParameterSidebar. */
export function dashboardParameterSidebar(page: Page): Locator {
  return page.getByTestId("dashboard-parameter-sidebar");
}

/** Port of H.dashboardParametersContainer. */
export function dashboardParametersContainer(page: Page): Locator {
  return page.getByTestId("dashboard-parameters-widget-container");
}

/** Port of H.editingDashboardParametersContainer. */
export function editingParametersContainer(page: Page): Locator {
  return page.getByTestId("edit-dashboard-parameters-widget-container");
}

/**
 * Port of H.filterWidget({ isEditing: true, name }): the editing-mode widgets,
 * optionally narrowed by a case-sensitive :contains(name) filter.
 */
export function editingFilterWidget(page: Page, name?: string): Locator {
  const widgets = page.getByTestId("editing-parameter-widget");
  return name != null
    ? widgets.filter({ hasText: caseSensitiveSubstring(name) })
    : widgets;
}

// caseSensitiveSubstring (Cypress :contains semantics) is now canonical in
// ./text; re-exported so this module's consumers keep their import unchanged.
export { caseSensitiveSubstring };

/**
 * Port of cy.findByDisplayValue: the form control in `scope` whose *current*
 * value equals `value`. Unlike dashboard-cards.ts inputWithValue this also
 * matches textarea/select, like the testing-library query does — the dashboard
 * title (EditableText) renders a <textarea>, which an input-only scan misses.
 */
export async function findByDisplayValue(
  scope: Locator,
  value: string,
): Promise<Locator> {
  const controls = scope.locator("input, textarea, select");
  await expect(controls.first()).toBeVisible();
  const count = await controls.count();
  for (let index = 0; index < count; index++) {
    if ((await controls.nth(index).inputValue()) === value) {
      return controls.nth(index);
    }
  }
  throw new Error(`No form control with display value "${value}" found`);
}

/**
 * Port of Cypress's "not.be.visible" for an element scrolled out of an
 * overflow-scrolling ancestor. Playwright's toBeVisible() ignores scroll
 * clipping (it only checks the box is non-empty), so compare the element's
 * rect against its scroll container's instead of the viewport's.
 */
export async function isClippedByScrollContainer(
  element: Locator,
  container: Locator,
): Promise<boolean> {
  const elementBox = await element.boundingBox();
  const containerBox = await container.boundingBox();
  if (!elementBox || !containerBox) {
    return true;
  }
  return (
    elementBox.y + elementBox.height <= containerBox.y ||
    elementBox.y >= containerBox.y + containerBox.height
  );
}

/** Port of H.goToTab (e2e-dashboard-helpers.ts). */
export { goToTab } from "./ui";

// === navigation helpers ===

/** Port of H.goToMainApp (e2e-ui-elements-helpers.js). */
export async function goToMainApp(page: Page) {
  await getProfileLink(page).click();
  await popover(page).getByText("Main app", { exact: true }).click();
}

/**
 * Port of H.commandPaletteSearch(query, viewAll: false): open the palette,
 * type the query and wait for the search response (the viewAll branch is not
 * needed by this spec).
 */
export async function commandPaletteSearch(page: Page, query: string) {
  await commandPaletteButton(page).click();
  const search = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/search",
  );
  await commandPaletteInput(page).pressSequentially(query);
  await search;
}

// === date filter helper ===

/**
 * Port of setAdHocFilter (e2e-date-filter-helpers.js), reduced to the
 * branches this spec exercises: condition + includeCurrent.
 */
export async function setAdHocFilter(
  page: Page,
  {
    condition,
    includeCurrent = false,
  }: { condition?: string; includeCurrent?: boolean } = {},
  buttonLabel = "Add filter",
) {
  const dropdown = popover(page).first();
  await dropdown.getByText("Relative date range…", { exact: true }).click();
  await dropdown.getByText(condition ?? "Previous", { exact: true }).click();
  if (includeCurrent) {
    await dropdown.getByLabel(/Include/).click();
  }
  await page.getByRole("button", { name: buttonLabel, exact: true }).click();
}

/** dayjs "MMM D, YYYY" equivalent for the issue-22482 range assertion. */
export function formatMonthDayYear(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// === request bookkeeping ===

/**
 * The waitForResponse side of a cy.intercept alias: register BEFORE the
 * triggering action, await after.
 */
export function waitForResponseMatching(
  page: Page,
  method: string,
  pathRegex: RegExp,
): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      pathRegex.test(new URL(response.url()).pathname),
  );
}

/**
 * The counting side of a cy.intercept alias
 * (cy.get("@alias.all").should("have.length", n)): returns a counter of
 * matching responses seen since registration.
 */
export function trackResponses(
  page: Page,
  method: string,
  pathRegex: RegExp,
): () => number {
  let count = 0;
  page.on("response", (response) => {
    if (
      response.request().method() === method &&
      pathRegex.test(new URL(response.url()).pathname)
    ) {
      count += 1;
    }
  });
  return () => count;
}

// === visit helpers ===

/**
 * Port of H.visitDashboard's `params` option: same dashcard-query waits as
 * ui.ts visitDashboard, but the URL carries a query string.
 */
export async function visitDashboardWithParams(
  page: Page,
  api: MetabaseApi,
  dashboardId: number,
  params: Record<string, string | number>,
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
  const cardQueryPaths = dashcards
    .filter((dashcard) => dashcard.card_id != null)
    .filter(
      (dashcard) =>
        firstTabId == null || dashcard.dashboard_tab_id === firstTabId,
    )
    .map(
      (dashcard) =>
        `/api/dashboard/${dashboardId}/dashcard/${dashcard.id}/card/${dashcard.card_id}/query`,
    );

  const waits = canView
    ? cardQueryPaths.map((cardQueryPath) =>
        page.waitForResponse(
          (response) => new URL(response.url()).pathname === cardQueryPath,
        ),
      )
    : [];

  const search = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString();
  await page.goto(`/dashboard/${dashboardId}${search ? `?${search}` : ""}`);
  await Promise.all(waits);
}

// From e2e/support/cypress_data.js.
const METABASE_SECRET_KEY =
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

const JWT_SIGN_SCRIPT = path.resolve(
  __dirname,
  "../../e2e/support/external/e2e-jwt-sign.js",
);

/**
 * Port of H.visitEmbeddedPage for dashboards, with the `setFilters` option
 * (filters passed as URL query params, matching Cypress's `qs`).
 */
export async function visitEmbeddedDashboard(
  page: Page,
  mb: SessionHarness,
  payload: { resource: { dashboard: number }; params: Record<string, unknown> },
  { setFilters = {} }: { setFilters?: Record<string, string | number> } = {},
) {
  const payloadWithExpiration = {
    ...payload,
    exp: Math.round(Date.now() / 1000) + 10 * 60, // 10 minute expiration
  };
  const token = execFileSync(
    "node",
    [
      JWT_SIGN_SCRIPT,
      JSON.stringify(payloadWithExpiration),
      METABASE_SECRET_KEY,
    ],
    { encoding: "utf8" },
  ).trim();

  const search = new URLSearchParams(
    Object.entries(setFilters).map(([key, value]) => [key, String(value)]),
  ).toString();

  // Always visit the embedded page logged out.
  await mb.signOut();
  await page.goto(`/embed/dashboard/${token}${search ? `?${search}` : ""}`);
}

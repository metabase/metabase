/**
 * Helpers for the dashboard-management spec port. Lives in its own file so
 * the shared support modules stay untouched. Ports of:
 * - H.createNativeQuestionAndDashboard / H.addOrUpdateDashboardCard /
 *   H.createQuestion-with-dashboard_id (e2e/support/helpers/api/*)
 * - H.openDashboardInfoSidebar / H.closeDashboardInfoSidebar / H.addTextBox
 *   (e2e/support/helpers/e2e-dashboard-helpers.ts)
 * - the spec-local assertOnRequest from dashboard-management.cy.spec.js,
 *   split into waitFor* (registered BEFORE the triggering action) and
 *   assertOnRequest (awaited after).
 */
import { expect } from "@playwright/test";
import type { Locator, Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { dashboardHeader, modal } from "./dashboard";
import { sidesheet } from "./revisions";
import { SAMPLE_DB_ID } from "./sample-data";
import { popover } from "./ui";

/**
 * First/last names from e2e/support/cypress_data.js — that file is untyped
 * JS outside this project's tsconfig include, so the user this spec needs
 * is inlined here (emails/passwords live in sample-data.ts USERS).
 */
export const USER_NAMES = {
  readonly: { first_name: "Read Only", last_name: "Tableton" },
} as const;

// === API helpers ===

type NativeQuestionDetails = {
  name?: string;
  native: { query: string; "template-tags"?: Record<string, unknown> };
  display?: string;
  database?: number;
};

// createNativeQuestion / createNativeQuestionAndDashboard are now canonical in
// ./factories; re-exported so this module's consumers keep their imports
// unchanged.
export {
  createNativeQuestion,
  createNativeQuestionAndDashboard,
} from "./factories";

/**
 * Port of H.createQuestion({ ..., dashboard_id }) — a "dashboard question"
 * saved directly into a dashboard. The shared api.createQuestion doesn't
 * accept dashboard_id, hence this spec-local variant.
 */
export async function createDashboardQuestion(
  api: MetabaseApi,
  details: {
    name: string;
    query: Record<string, unknown>;
    dashboard_id: number;
    database?: number;
  },
) {
  const { name, query, dashboard_id, database = SAMPLE_DB_ID } = details;
  const response = await api.post("/api/card", {
    name,
    type: "question",
    display: "table",
    visualization_settings: {},
    dashboard_id,
    dataset_query: { type: "query", query, database },
  });
  return (await response.json()) as { id: number };
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

/**
 * Port of H.addOrUpdateDashboardCard. Like the original, the PUT replaces
 * the dashboard's dashcards with exactly the given card.
 */
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

// === UI helpers ===

/** Port of H.openDashboardInfoSidebar. */
export async function openDashboardInfoSidebar(page: Page) {
  await dashboardHeader(page).getByLabel("More info", { exact: true }).click();
}

/** Port of H.closeDashboardInfoSidebar. */
export async function closeDashboardInfoSidebar(page: Page) {
  await sidesheet(page).getByLabel("Close", { exact: true }).click();
}

/** Port of H.addTextBox (enters edit mode, adds a text card, types into it). */
export async function addTextBox(page: Page, text: string) {
  await page.getByLabel("Edit dashboard", { exact: true }).click();
  await page.getByLabel("Add a heading or text box", { exact: true }).click();
  await popover(page).getByText("Text", { exact: true }).click();
  await page
    .getByPlaceholder(
      "You can use Markdown here, and include variables {{like_this}}",
      { exact: true },
    )
    .fill(text);
}

/**
 * Port of cy.findAllByTestId("collection-entry-name").should("contain", name):
 * matches every entry whose text contains `name` (case-sensitive, like the
 * Cypress :contains assertion). Assert `not.toHaveCount(0)` for "contain"
 * and `toHaveCount(0)` for "not.contain".
 */
export function collectionEntry(page: Page, name: string): Locator {
  return page.getByTestId("collection-entry-name").filter({
    hasText: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  });
}

// === request waits + spec-local assertOnRequest ===

export function waitForDashboardGet(
  page: Page,
  dashboardId: number,
): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === `/api/dashboard/${dashboardId}`,
  );
}

export function waitForDashboardUpdate(
  page: Page,
  dashboardId: number,
): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === `/api/dashboard/${dashboardId}`,
  );
}

export function waitForDashboardCopy(
  page: Page,
  dashboardId: number,
): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        `/api/dashboard/${dashboardId}/copy`,
  );
}

/**
 * Port of the spec's assertOnRequest(alias): the waitFor* promise must be
 * registered before the triggering action; this awaits it and mirrors the
 * original's checks (no 403, no permission error screen, no lingering modal).
 */
export async function assertOnRequest(
  page: Page,
  response: Promise<Response>,
) {
  expect((await response).status()).not.toBe(403);
  await expect(
    page.getByText("Sorry, you don’t have permission to see that.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(modal(page)).toHaveCount(0);
}

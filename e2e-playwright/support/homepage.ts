/**
 * Helpers for the homepage spec port
 * (e2e/test/scenarios/onboarding/home/homepage.cy.spec.js).
 *
 * New file so the shared support modules stay untouched (porting rule 9);
 * everything else (modal/popover/navigationSidebar/newButton/main, the
 * dashboard header/edit bar, createDashboard, entityPickerModal, undoToast,
 * visitDashboard/visitQuestion, the x-ray candidate wait) is imported
 * read-only from the shared support files.
 */
import type { Locator, Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { openUnpinnedItemMenu } from "./collections";
import { icon, popover } from "./ui";

// === x-ray response waits ==========================================

/**
 * Register a wait for the automagic-dashboards GET the x-ray drill fires
 * (Cypress `@getXrayDashboard` = GET /api/automagic-*​/table/**). The alias
 * was table-only, but the suggestion sidebar's zoom-in drills into a FIELD
 * x-ray (GET /api/automagic-dashboards/field/:id) — verified against the jar —
 * so this matches any automagic dashboard load except the candidates endpoint
 * (that fires only on the home page, not on a drill). Register BEFORE the
 * triggering click, await after (porting rule 2).
 */
export function waitForXrayDashboard(page: Page): Promise<Response> {
  return page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname;
    return (
      response.request().method() === "GET" &&
      pathname.startsWith("/api/automagic-dashboards/") &&
      !pathname.includes("/candidates")
    );
  });
}

/**
 * Register a wait for the x-ray candidates GET (Cypress `@getXrayCandidates`
 * = GET /api/automagic-*​/database/**).
 */
export function waitForXrayCandidates(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/automagic-[^/]+\/database\//.test(
        new URL(response.url()).pathname,
      ),
  );
}

// === recents / popular / dashboard / collection waits ==============
// The Cypress beforeEach registered these as aliases and waited later. Under
// Playwright the wait must be registered before the triggering navigation
// (rule 2), so each is a small factory called inline just before page.goto.

export function waitForRecentItems(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/activity/recents",
  );
}

export function waitForPopularItems(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/activity/popular_items",
  );
}

export function waitForDashboardGet(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/dashboard\/\d+$/.test(new URL(response.url()).pathname),
  );
}

export function waitForCollectionItems(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/collection\/[^/]+\/items$/.test(
        new URL(response.url()).pathname,
      ),
  );
}

export function waitForCardQuery(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/card\/\d+\/query$/.test(new URL(response.url()).pathname),
  );
}

// === SQLite database (built-in driver + repo-root fixture file) ====

/**
 * Port of H.addSqliteDatabase / cy.addSQLiteDatabase: POST /api/database with
 * the repo-root `resources/sqlite-fixture.db` file. The slot backend runs from
 * REPO_ROOT (support/worker-backend.ts), so the relative path resolves and no
 * external DB is needed — this is a local fixture, not infra-gated.
 *
 * The Cypress QA helper polls until sync completes before returning the id;
 * do the same so the field-metadata lookup (withDatabase) sees the synced
 * tables. Returns the new database's id.
 */
export async function addSqliteDatabase(
  api: MetabaseApi,
  name = "sqlite",
  { waitForSync = true }: { waitForSync?: boolean } = {},
): Promise<number> {
  const response = await api.post("/api/database", {
    engine: "sqlite",
    name,
    details: { db: "./resources/sqlite-fixture.db" },
    auto_run_queries: true,
    is_full_sync: true,
    schedules: {
      cache_field_values: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: 0,
        schedule_type: "daily",
      },
      metadata_sync: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: null,
        schedule_type: "hourly",
      },
    },
  });
  const { id } = (await response.json()) as { id: number };

  if (waitForSync) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const dbResponse = await api.get(`/api/database/${id}`);
      const db = (await dbResponse.json()) as {
        initial_sync_status?: string;
      };
      if (db.initial_sync_status === "complete") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return id;
}

/**
 * Port of H.withDatabase: fetch a database's metadata and build the
 * `{ TABLE: { FIELD: id }, TABLE_ID: id }` map the Cypress helper hands its
 * callback. Returns the map for direct field-id lookups.
 */
export async function getDatabaseFields(
  api: MetabaseApi,
  databaseId: number,
): Promise<Record<string, Record<string, number>>> {
  const response = await api.get(
    `/api/database/${databaseId}/metadata?include_hidden=true`,
  );
  const body = (await response.json()) as {
    tables?: {
      name: string;
      id: number;
      fields?: { name: string; id: number }[];
    }[];
  };
  const result: Record<string, Record<string, number>> = {};
  for (const table of body.tables ?? []) {
    const fields: Record<string, number> = {};
    for (const field of table.fields ?? []) {
      fields[field.name.toUpperCase()] = field.id;
    }
    result[table.name.toUpperCase()] = fields;
  }
  return result;
}

// === stubbed x-ray candidates (multi-schema test) ==================

/** Port of the spec-local getXrayCandidates() fixture. */
export function getXrayCandidatesFixture() {
  return [
    {
      id: "1/public",
      schema: "public",
      tables: [{ title: "Orders", url: "/auto/dashboard/table/1" }],
    },
    {
      id: "1/private",
      schema: "private",
      tables: [{ title: "People", url: "/auto/dashboard/table/2" }],
    },
  ];
}

/**
 * Port of `cy.intercept("/api/automagic-*​/database/**", getXrayCandidates())`:
 * stub the candidates endpoint with the fixed two-schema fixture. Register
 * before page.goto.
 */
export async function stubXrayCandidates(page: Page) {
  await page.route(
    (url) =>
      /^\/api\/automagic-[^/]+\/database\//.test(new URL(url.href).pathname),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(getXrayCandidatesFixture()),
      }),
  );
}

// === collection pin helper =========================================

/**
 * Port of the spec-local pinItem(name): open the unpinned row's ellipsis menu
 * and click Pin. openUnpinnedItemMenu hovers the row (the ellipsis is
 * hover-gated) — the faithful equivalent of `.closest("tr").icon("ellipsis")`.
 */
export async function pinItem(page: Page, name: string) {
  await openUnpinnedItemMenu(page, name);
  await icon(popover(page), "pin").click();
}

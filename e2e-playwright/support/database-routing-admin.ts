/**
 * Helpers for the database-routing-admin spec (port of
 * e2e/test/scenarios/admin/database-routing/database-routing-admin.cy.spec.ts
 * and the subset of its e2e-database-routing-helpers.ts that the spec uses).
 *
 * The whole upstream spec restores the `postgres-writable` snapshot and drives
 * WRITABLE_DB_ID (the writable QA postgres) — creating destination "mirror"
 * databases that connect to the QA postgres on QA_POSTGRES_PORT. Neither the
 * snapshot nor the QA postgres is provisioned in the spike, so the spec is
 * infra-gated (PW_QA_DB_ENABLED) and SKIPS on the jar. These helpers are
 * faithful-by-construction; a green run there means "correctly skipped".
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { tooltip } from "./charts";
import { icon } from "./ui";

/** Mirrors e2e/support/cypress_data.js SAMPLE_DB_ID / WRITABLE_DB_ID. */
export const SAMPLE_DB_ID = 1;
export const WRITABLE_DB_ID = 2;

/** Mirrors USER_GROUPS.ALL_USERS_GROUP (e2e/support/cypress_data.js). */
export const ALL_USERS_GROUP = 1;

/** Mirrors QA_POSTGRES_PORT (e2e/support/cypress_data.js). */
export const QA_POSTGRES_PORT = 5404;

// === ports of e2e-database-routing-helpers.ts (the subset this spec uses) ===

/** Port of configureDbRoutingViaAPI. */
export function configureDbRoutingViaAPI(
  api: MetabaseApi,
  {
    router_database_id,
    user_attribute,
  }: { router_database_id: number; user_attribute: string | null },
) {
  return api.put(
    `/api/ee/database-routing/router-database/${router_database_id}`,
    { user_attribute },
  );
}

/** Port of createDestinationDatabasesViaAPI. */
export function createDestinationDatabasesViaAPI(
  api: MetabaseApi,
  {
    router_database_id,
    databases,
  }: { router_database_id: number; databases: unknown[] },
) {
  return api.post("/api/ee/database-routing/destination-database", {
    router_database_id,
    destinations: databases,
  });
}

/** Port of BASE_POSTGRES_DESTINATION_DB_INFO. */
export const BASE_POSTGRES_DESTINATION_DB_INFO = {
  is_on_demand: false,
  is_full_sync: true,
  is_sample: false,
  cache_ttl: null,
  refingerprint: false,
  auto_run_queries: true,
  schedules: {},
  details: {
    host: "localhost",
    port: QA_POSTGRES_PORT,
    dbname: "sample",
    user: "metabase",
    "use-auth-provider": false,
    password: "metasample123",
    "schema-filters-type": "all",
    ssl: false,
    "tunnel-enabled": false,
    "advanced-options": false,
  },
  name: "DestinationDB",
  engine: "postgres",
};

// === spec-local section locators ===

/** Port of the spec-local dbConnectionInfoSection. */
export function dbConnectionInfoSection(page: Page): Locator {
  return page.getByTestId("database-connection-info-section");
}

/** Port of the spec-local dbRoutingSection. */
export function dbRoutingSection(page: Page): Locator {
  return page.getByTestId("database-routing-section");
}

/** Port of the spec-local modelsSection. */
export function modelsSection(page: Page): Locator {
  return page.getByTestId("database-model-features-section");
}

/** Port of the spec-local tableEditingSection. */
export function tableEditingSection(page: Page): Locator {
  return page.getByTestId("database-table-editing-section");
}

// === spec-local flows ===

/** Port of the spec-local visitDatabaseAdminPage. */
export async function visitDatabaseAdminPage(page: Page, databaseId: number) {
  await page.goto(`/admin/databases/${databaseId}`);
}

/** Port of the spec-local visitUploadSettingsPage. */
export async function visitUploadSettingsPage(page: Page) {
  await page.goto("/admin/settings/uploads");
}

/** Port of the spec-local expandDbRouting: click the section chevron. */
export async function expandDbRouting(page: Page) {
  await icon(dbRoutingSection(page), "chevrondown").click();
}

/**
 * Port of H.typeAndBlurUsingLabel (e2e-misc-helpers.js):
 * `cy.findByLabelText(label).clear().type(value).blur()`. The label may be a
 * regex (the destination-db form fields are matched by /Slug/, /Host/, …); the
 * shared ai-controls.typeAndBlur is string-exact only, so this one lives here.
 * `fill` clears then types (matching .clear().type()).
 */
export async function typeAndBlurUsingLabel(
  scope: Page | Locator,
  label: string | RegExp,
  value: string,
) {
  const field = scope.getByLabel(label);
  await field.click();
  await field.fill(value);
  await field.blur();
}

/** Port of the spec-local disableModelActionsViaApi. */
export function disableModelActionsViaApi(api: MetabaseApi, databaseId: number) {
  return api.put(`/api/database/${databaseId}`, {
    settings: { "database-enable-actions": false },
  });
}

/** Port of the spec-local enableModelActionsViaApi. */
export function enableModelActionsViaApi(api: MetabaseApi, databaseId: number) {
  return api.put(`/api/database/${databaseId}`, {
    settings: { "database-enable-actions": true },
  });
}

/** Port of H.enableUploads("postgres") (e2e-upload-helpers.js). */
export function enableUploadsViaApi(api: MetabaseApi) {
  return api.put("/api/setting", {
    "uploads-settings": {
      db_id: WRITABLE_DB_ID,
      schema_name: "public",
      table_prefix: null,
    },
  });
}

/** Port of the spec-local setupModelPersistence. */
export async function setupModelPersistence(page: Page) {
  const enablePersistence = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname === "/api/persist/enable",
  );
  await page.goto("/admin/performance/models");
  // findByLabelText string → exact (PORTING rule 1).
  await page
    .getByTestId("admin-layout-content")
    .getByLabel("Disabled", { exact: true })
    .click();
  await enablePersistence;
}

/** Port of the spec-local enableGlobalModelPersistence. */
export async function enableGlobalModelPersistence(page: Page) {
  await page.goto("/admin/performance/models");
  await page.getByLabel("Disabled", { exact: true }).click();
}

const DISABLED_REASON_RE = /Database routing can't be enabled if/;

/**
 * Port of the spec-local assertDbRoutingNotDisabled: the toggle is enabled, and
 * hovering it does NOT surface the "can't be enabled if…" tooltip.
 */
export async function assertDbRoutingNotDisabled(page: Page) {
  const toggle = dbRoutingSection(page).getByLabel("Enable database routing", {
    exact: true,
  });
  await expect(toggle).not.toBeDisabled();
  await toggle.hover();
  await expect(page.getByText(DISABLED_REASON_RE)).toHaveCount(0);
}

/**
 * Port of the spec-local assertDbRoutingDisabled: the toggle is unchecked and
 * disabled, and hovering the wrapper surfaces the "can't be enabled if…"
 * tooltip.
 *
 * CAPABILITY PROBE (see the spec header + findings): upstream had to use
 * `cy.trigger("mouseenter")` on `database-routing-toggle-wrapper` here because
 * Chrome v122+ headless hit-tested CDP mouse events to the disabled <input>
 * inside the Mantine Switch, swallowed the boundary events, and never fired the
 * Tooltip — so `realHover()` was unreliable. This port uses Playwright's real
 * `hover()` on the wrapper to see whether it fires reliably where Cypress
 * headless couldn't. `{ force: true }` is required: Playwright's actionability
 * would otherwise refuse to hover a point occupied by the disabled control on
 * top (the same hit-test that defeated Cypress). NOTE: unverifiable in this
 * spike — the spec is infra-gated on the writable QA postgres, so this path
 * never actually runs here; no capability dividend is claimed.
 */
export async function assertDbRoutingDisabled(page: Page) {
  const section = dbRoutingSection(page);
  const toggle = section.getByLabel("Enable database routing", { exact: true });
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeDisabled();

  await section
    .getByTestId("database-routing-toggle-wrapper")
    .hover({ force: true });
  await expect(tooltip(page).getByText(DISABLED_REASON_RE)).toBeVisible();
}

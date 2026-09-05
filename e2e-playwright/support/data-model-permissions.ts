/**
 * Helpers for the data-model-permissions port
 * (e2e/test/scenarios/permissions/data-model-permissions.cy.spec.js).
 *
 * New helpers only (PORTING.md rule 9). Everything else is imported read-only:
 * - `modifyPermission` from support/admin-permissions.ts (full upstream form)
 * - `assertPermissionForItem` from support/download-permissions.ts
 * - `visitDataModel` / `TablePicker` / `TableSection` / `FieldSection` /
 *   `waitForTableUpdate` / `SAMPLE_DB_SCHEMA_ID` from support/data-model.ts
 * - `goToAdmin` from support/command-palette.ts
 * - `signInWithCachedSession` from support/permissions.ts (the "none" user is
 *   outside the mb fixture's typed USERS map)
 * - `undoToast` from support/metrics.ts, `modal` from support/ui.ts
 *
 * Only the two items below have no shared home:
 * - `savePermissionsGraph` — the spec-local save-and-confirm flow on the data
 *   permissions page.
 * - `waitForTableMetadata` — a GET /api/table/:id/query_metadata wait (the
 *   Cypress `@tableMetadataFetch` alias). data-model.ts keeps the equivalent
 *   predicate private, so it's re-derived here (pathname only — the query
 *   string carries the include_* flags Cypress matched, but the pathname is
 *   unique to this request).
 */
import type { Page, Response } from "@playwright/test";

import { expect } from "./fixtures";
import { modal } from "./ui";

/** Port of the spec-local savePermissionsGraph. */
export async function savePermissionsGraph(page: Page) {
  await page.getByRole("button", { name: "Save changes", exact: true }).click();

  const dialog = modal(page);
  await expect(
    dialog.getByText("Save permissions?", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Are you sure you want to do this?", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(modal(page)).toHaveCount(0);
}

/** GET /api/table/:id/query_metadata — the Cypress @tableMetadataFetch alias. */
export function waitForTableMetadata(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/table\/\d+\/query_metadata$/.test(
        new URL(response.url()).pathname,
      ),
  );
}

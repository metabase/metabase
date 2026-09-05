/**
 * Helpers for the source-replacement spec port
 * (e2e/test/scenarios/data-studio/data-model/source-replacement.cy.spec.ts).
 *
 * Carries the `H.DataModel.SourceReplacement` locator surface
 * (e2e/support/helpers/e2e-datamodel-helpers.ts) plus the two navigation
 * helpers the spec needs against the WRITABLE database — the shared
 * segments-data-studio.ts / measures-data-studio.ts copies hardcode
 * SAMPLE_DB_ID in their URL builders, so they can't be reused here.
 *
 * New module per PORTING rule 9 — imports read-only from the shared support
 * modules and does not edit them.
 */
import type { Locator, Page, Response } from "@playwright/test";

import { expect } from "./fixtures";
import { modal } from "./ui";

/**
 * Port of H.DataModel.SourceReplacement (e2e-datamodel-helpers.ts).
 *
 * `getModal` is `modal().first()`: the replacement modal is full-screen and,
 * once the confirmation dialog opens, a SECOND modal is mounted after it in
 * the DOM. `getConfirmationModal` is the Cypress
 * `modal().should("have.length", 2).last()` — the count assertion is kept
 * because it is what makes ".last()" mean "the confirmation dialog".
 */
export const SourceReplacement = {
  getModal: (page: Page): Locator => modal(page).first(),

  getConfirmationModal: async (page: Page): Promise<Locator> => {
    await expect(modal(page)).toHaveCount(2);
    return modal(page).last();
  },

  getReplaceButton: (page: Page): Locator =>
    SourceReplacement.getModal(page).getByRole("button", {
      name: /Replace data source/,
    }),

  getCancelButton: (page: Page): Locator =>
    SourceReplacement.getModal(page).getByRole("button", {
      name: "Cancel",
      exact: true,
    }),

  // Cypress: getModal().contains("button", "Pick a table, model, or saved
  // question") — a case-sensitive substring match on a button.
  getTargetPickerButton: (page: Page): Locator =>
    SourceReplacement.getModal(page)
      .locator("button")
      .filter({ hasText: /Pick a table, model, or saved question/ }),

  getDependentsTab: (page: Page, count: number): Locator =>
    SourceReplacement.getModal(page).getByRole("tab", {
      name: new RegExp(`${count} items? will be changed`),
    }),

  // Page-scoped in Cypress too (the menu is a portal outside the modal).
  getFindAndReplaceButton: (page: Page): Locator =>
    page.getByRole("menuitem", { name: /Find and replace/ }),
};

/** POST /api/ee/replacement/replace-source — the `@replaceSource` alias. */
export function waitForReplaceSource(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        "/api/ee/replacement/replace-source",
  );
}

/**
 * GET /api/ee/dependencies/graph/dependents* — the `@dependents` alias.
 * Register BEFORE the click that opens the replacement modal.
 */
export function waitForDependents(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname ===
        "/api/ee/dependencies/graph/dependents",
  );
}

/** GET /api/table/:id/query_metadata — the data-model routes' load gate. */
function waitForTableMetadata(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/table\/\d+\/query_metadata/.test(
        new URL(response.url()).pathname,
      ),
  );
}

/**
 * Port of H.DataModel.visitDataStudioSegments for an arbitrary database /
 * schema (the shared segments-data-studio.ts copy is SAMPLE_DB-only).
 */
export async function visitDataStudioSegments(
  page: Page,
  { databaseId, schemaId, tableId }: VisitTableOptions,
) {
  const metadata = waitForTableMetadata(page);
  await page.goto(
    `/data-studio/data/database/${databaseId}/schema/${schemaId}/table/${tableId}/segments`,
  );
  await metadata;
}

/** Port of H.DataModel.visitDataStudioMeasures, database-parameterised. */
export async function visitDataStudioMeasures(
  page: Page,
  { databaseId, schemaId, tableId }: VisitTableOptions,
) {
  const metadata = waitForTableMetadata(page);
  await page.goto(
    `/data-studio/data/database/${databaseId}/schema/${schemaId}/table/${tableId}/measures`,
  );
  await metadata;
}

export type VisitTableOptions = {
  databaseId: number;
  schemaId: string;
  tableId: number;
};

/** Port of H.visitTransform (e2e-transform-helpers.ts) — a bare visit. */
export async function visitTransform(page: Page, transformId: number) {
  await page.goto(`/data-studio/transforms/${transformId}`);
}

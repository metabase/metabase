/**
 * Helpers for the collection-permissions spec port
 * (e2e/test/scenarios/collections/permissions.cy.spec.js).
 *
 * Ports the spec-local functions (clickButton, pinItem, move, duplicate,
 * archiveUnarchive) plus the two admin-permissions response waits.
 *
 * Lives in its own file so shared support modules stay untouched
 * (PORTING.md rule 9). Existing helpers (openCollectionItemMenu,
 * openCollectionMenu, displaySidebarChildOf, entityPickerModal, icon,
 * popover, modal, navigationSidebar, collectionTable) are imported read-only.
 *
 * exposeChildrenFor (spec-local) is not re-ported: it walks the sidebar row up
 * to sidebar-collection-link-root and clicks the top-level chevron — identical
 * behaviour to the shared collections-core displaySidebarChildOf, which the
 * spec already uses elsewhere for the same expand.
 */
import type { Locator, Page, Response } from "@playwright/test";
import { expect } from "@playwright/test";

import { openCollectionItemMenu } from "./bookmarks-extras";
import { displaySidebarChildOf } from "./collections-core";
import { entityPickerModal } from "./notebook";
import { icon, modal, navigationSidebar, popover } from "./ui";

type LocatorScope = Page | Locator;

/**
 * First/last names from e2e/support/cypress_data.js — that file is untyped JS
 * and not imported by the spike, so the subset the spec needs is mirrored here.
 * (PORTING flags a shared USERS name map as a later consolidation candidate.)
 */
export const USER_FULL_NAMES: Record<string, string> = {
  admin: "Bobby Tables",
  normal: "Robert Tableton",
  nodata: "No Data Tableton",
  readonly: "Read Only Tableton",
  nocollection: "No Collection Tableton",
};

/** `${first_name} ${last_name}'s Personal Collection` for a snapshot user. */
export function personalCollectionName(user: string): string {
  return `${USER_FULL_NAMES[user]}'s Personal Collection`;
}

/**
 * Port of the spec-local clickButton: assert the button is enabled, then click.
 * `scope` mirrors the Cypress call site, which runs inside `H.modal().within()`.
 */
export async function clickButton(scope: LocatorScope, name: string) {
  const button = scope.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled();
  await button.click();
}

/** Port of the spec-local pinItem: open the row menu, click the pin icon. */
export async function pinItem(page: Page, item: string) {
  await openCollectionItemMenu(page, item);
  await icon(popover(page), "pin").click();
}

/**
 * Port of the spec-local move(item): trash-free move of a root item into
 * First > Second via the entity picker, assert it landed, then undo.
 */
export async function move(page: Page, item: string) {
  await page.goto("/collection/root");
  await openCollectionItemMenu(page, item);
  await popover(page).getByText("Move", { exact: true }).click();

  const picker = entityPickerModal(page);
  await expect(picker.getByText(`Move "${item}"?`, { exact: true })).toBeVisible();
  // Let's move it into a nested collection
  await picker.getByText("First collection", { exact: true }).click();
  await picker.getByText("Second collection", { exact: true }).click();
  await picker.getByRole("button", { name: "Move", exact: true }).click();

  await expect(page.getByText(item, { exact: true })).toHaveCount(0);
  // Make sure item was properly moved to a correct sub-collection
  await displaySidebarChildOf(page, "First collection");
  await navigationSidebar(page)
    .getByText("Second collection", { exact: true })
    .click();
  await expect(page.getByText(item, { exact: true }).first()).toBeVisible();
  // Undo the whole thing
  await expect(page.getByText(/Moved (question|dashboard)/)).toBeVisible();
  await page.getByText("Undo", { exact: true }).first().click();
  await expect(page.getByText(item, { exact: true })).toHaveCount(0);
  await page.goto("/collection/root");
  await expect(page.getByText(item, { exact: true }).first()).toBeVisible();
}

/** Port of the spec-local duplicate(item). */
export async function duplicate(page: Page, item: string) {
  await page.goto("/collection/root");
  await openCollectionItemMenu(page, item);
  await popover(page).getByText("Duplicate", { exact: true }).click();

  const dialog = modal(page);
  await clickButton(dialog, "Duplicate");
  await expect(dialog.getByText("Failed", { exact: true })).toHaveCount(0);
  await expect(modal(page)).toHaveCount(0);
  await expect(
    page.getByText(`${item} - Duplicate`, { exact: true }).first(),
  ).toBeVisible();
}

/**
 * Port of the spec-local archiveUnarchive(item, expectedEntityName): trash a
 * root item, confirm the toast, undo, confirm it's back and visible.
 */
export async function archiveUnarchive(
  page: Page,
  item: string,
  expectedEntityName: string,
) {
  await page.goto("/collection/root");
  await openCollectionItemMenu(page, item);
  await popover(page).getByText("Move to trash", { exact: true }).click();
  await expect(page.getByText(item, { exact: true })).toHaveCount(0);
  await expect(
    page.getByText(`Trashed ${expectedEntityName}`, { exact: true }).first(),
  ).toBeVisible();
  await page.getByText("Undo", { exact: true }).first().click();
  await expect(
    page.getByText("Sorry, you don’t have permission to see that.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByText(item, { exact: true }).first()).toBeVisible();
}

// === Admin collection-permissions response waits (PORTING rule 2) ===

/** GET /api/collection/graph — the Cypress "@permissionsGraph" alias. */
export function waitForCollectionGraph(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/collection/graph",
  );
}

/** GET /api/permissions/group — the Cypress "@permissionsGroups" alias. */
export function waitForPermissionsGroups(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/permissions/group",
  );
}

/** The row whose exact-text cell equals `item` (for hover/checkbox probes). */
export function collectionRow(page: Page, item: string): Locator {
  return page
    .getByRole("row")
    .filter({ has: page.getByText(item, { exact: true }) });
}

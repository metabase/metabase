/**
 * Helpers for the collections-trash spec port
 * (e2e/test/scenarios/collections/trash.cy.spec.js).
 *
 * Lives in its own file so shared support modules stay untouched
 * (PORTING.md rule 9). Reuses support/collections.ts dragAndDrop (imported by
 * the spec) for the sidebar drag/drop tests.
 *
 * Ports of:
 * - the spec-local api factories (createCollection / createQuestion /
 *   createNativeQuestion / createDashboard, each with an optional `archive`
 *   flag) plus the H.archive* helpers they wrap (api/archive*.ts).
 * - the spec-local UI helpers (toggleEllipsisMenuFor, archiveBanner,
 *   ensureCanRestoreFromPage, selectItem, assertChecked,
 *   assertTrashSelectedInNavigationSidebar, ensureBookmarkVisible).
 * - H.selectSidebarItem (e2e-permissions-helpers.js).
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { SAMPLE_DB_ID } from "./sample-data";
import {
  collectionTable,
  icon,
  modal,
  navigationSidebar,
  openNavigationSidebar,
  sidebarSection,
} from "./ui";
import { visitCollection } from "./question-new";

// === API factories (ports of the spec-local create* wrappers) ===

type Entity = { id: number; name: string };

/** Port of H.archiveCollection (api/archiveCollection.ts). */
export async function archiveCollection(api: MetabaseApi, id: number) {
  await api.put(`/api/collection/${id}`, { archived: true });
}

/** Port of H.archiveQuestion (api/archiveQuestion.ts). */
export async function archiveQuestion(api: MetabaseApi, id: number) {
  await api.put(`/api/card/${id}`, { archived: true });
}

/** Port of H.archiveDashboard (api/archiveDashboard.ts). */
export async function archiveDashboard(api: MetabaseApi, id: number) {
  await api.put(`/api/dashboard/${id}`, { archived: true });
}

/**
 * Port of the spec-local createCollection(collectionInfo, archive): create the
 * collection and optionally move it straight to the trash.
 */
export async function createCollection(
  api: MetabaseApi,
  info: { name: string; parent_id?: number | null },
  archive = false,
): Promise<Entity> {
  const response = await api.post("/api/collection", {
    parent_id: null,
    ...info,
  });
  const collection = (await response.json()) as Entity;
  if (archive) {
    await archiveCollection(api, collection.id);
  }
  return collection;
}

/** Port of the spec-local createQuestion(questionInfo, archive) (MBQL query). */
export async function createQuestion(
  api: MetabaseApi,
  info: {
    name: string;
    query: Record<string, unknown>;
    collection_id?: number | null;
    display?: string;
  },
  archive = false,
): Promise<Entity> {
  const { name, query, display = "table", ...rest } = info;
  const response = await api.post("/api/card", {
    name,
    type: "question",
    display,
    visualization_settings: {},
    ...rest,
    dataset_query: { type: "query", query, database: SAMPLE_DB_ID },
  });
  const question = (await response.json()) as Entity;
  if (archive) {
    await archiveQuestion(api, question.id);
  }
  return question;
}

/** Port of the spec-local createNativeQuestion(questionInfo, archive). */
export async function createNativeQuestion(
  api: MetabaseApi,
  info: {
    name: string;
    native: { query: string; "template-tags"?: Record<string, unknown> };
    type?: string;
    display?: string;
    collection_id?: number | null;
  },
  archive = false,
): Promise<Entity> {
  const { name, native, type = "question", display = "table", ...rest } = info;
  const response = await api.post("/api/card", {
    name,
    type,
    display,
    visualization_settings: {},
    ...rest,
    dataset_query: { type: "native", native, database: SAMPLE_DB_ID },
  });
  const question = (await response.json()) as Entity;
  if (archive) {
    await archiveQuestion(api, question.id);
  }
  return question;
}

/** Port of the spec-local createDashboard(dashboardInfo, archive). */
export async function createDashboard(
  api: MetabaseApi,
  info: { name: string; collection_id?: number | null },
  archive = false,
): Promise<Entity> {
  const response = await api.post("/api/dashboard", info);
  const dashboard = (await response.json()) as Entity;
  if (archive) {
    await archiveDashboard(api, dashboard.id);
  }
  return dashboard;
}

// === UI helpers ===

/**
 * Port of the spec-local toggleEllipsisMenuFor: the row-level ellipsis in the
 * collection table. Cypress clicked it directly; Playwright's real mouse needs
 * the row hovered first (the icon is hover-gated), and the click is forced past
 * the hover overlay — same treatment as collections-core openEllipsisMenuFor.
 * `item` may be a string (exact) or a RegExp (some call sites pass /Collection A/).
 */
export async function toggleEllipsisMenuFor(page: Page, item: string | RegExp) {
  const text =
    typeof item === "string"
      ? page.getByText(item, { exact: true })
      : page.getByText(item);
  const row = collectionTable(page)
    .getByRole("row")
    .filter({ has: text });
  await row.hover();
  await icon(row, "ellipsis").click({ force: true });
}

/** Port of the spec-local archiveBanner. */
export function archiveBanner(page: Page): Locator {
  return page.getByTestId("archive-banner");
}

/**
 * Port of the spec-local ensureCanRestoreFromPage: from an archived entity's
 * detail page, confirm it's gone from root, go back, restore via the banner,
 * and confirm it's back in root.
 */
export async function ensureCanRestoreFromPage(page: Page, name: string) {
  // Wait for the archive-confirmation modal to fully close before navigating
  // away: page.goBack() restores the previous page from the back-forward cache,
  // and if the modal overlay is still mounted at navigation time the restored
  // snapshot keeps it — a fixed overlay that then intercepts the banner click.
  // (Cypress's inter-command latency always let the modal finish closing.)
  await expect(modal(page)).toHaveCount(0);
  await page.goto("/collection/root");
  await expect(
    collectionTable(page).getByText(name, { exact: true }),
  ).toHaveCount(0);
  await page.goBack();
  await expect(archiveBanner(page)).toBeVisible();
  await archiveBanner(page).getByText("Restore", { exact: true }).click();
  await expect(archiveBanner(page)).toHaveCount(0);
  await page.goto("/collection/root");
  await expect(
    collectionTable(page).getByText(name, { exact: true }),
  ).toBeVisible();
}

/**
 * Port of the spec-local selectItem: click the checkbox's enclosing button in
 * the row containing `name`.
 */
export async function selectItem(page: Page, name: string) {
  const row = page
    .getByText(name, { exact: true })
    .locator("xpath=ancestor::tr[1]");
  await row.getByRole("checkbox").locator("xpath=ancestor::button[1]").click();
}

/** Port of the spec-local assertChecked. */
export async function assertChecked(page: Page, name: string, checked = true) {
  const checkbox = page
    .getByText(name, { exact: true })
    .locator("xpath=ancestor::tr[1]")
    .getByRole("checkbox");
  if (checked) {
    await expect(checkbox).toBeChecked();
  } else {
    await expect(checkbox).not.toBeChecked();
  }
}

/**
 * Port of the spec-local assertTrashSelectedInNavigationSidebar: the Trash
 * item's nearest <li> ancestor carries aria-selected="true". Dashboard/question
 * routes collapse the navbar, so re-open it first (idempotent, self-healing).
 */
export async function assertTrashSelectedInNavigationSidebar(page: Page) {
  await openNavigationSidebar(page);
  const trashLi = navigationSidebar(page)
    .getByText("Trash", { exact: true })
    .locator("xpath=ancestor::li[1]");
  await expect(trashLi).toHaveAttribute("aria-selected", "true");
}

/** Port of the spec-local ensureBookmarkVisible. */
export async function ensureBookmarkVisible(page: Page, bookmark: string | RegExp) {
  const text =
    typeof bookmark === "string"
      ? sidebarSection(page, "Bookmarks").getByText(bookmark, { exact: true })
      : sidebarSection(page, "Bookmarks").getByText(bookmark);
  await expect(text).toBeVisible();
}

/**
 * Port of H.selectSidebarItem (e2e-permissions-helpers.js):
 * cy.findAllByRole("menuitem").contains(item).click() — case-sensitive
 * substring, first match.
 */
export async function selectSidebarItem(page: Page, item: string) {
  await page.getByRole("menuitem").filter({ hasText: item }).first().click();
}

/** Port of visitRootCollection (cy.visit("/collection/root")). */
export async function visitRootCollection(page: Page) {
  await visitCollection(page, "root");
}

/**
 * Helpers for the collections spec port
 * (e2e/test/scenarios/collections/collections.cy.spec.js).
 *
 * Ports of:
 * - e2e/test/scenarios/collections/helpers/e2e-collections-sidebar.js
 *   (displaySidebarChildOf)
 * - e2e/support/helpers/e2e-collection-helpers.ts (openCollectionMenu,
 *   moveOpenedCollectionTo) and e2e-ui-elements-helpers.js
 *   (closeNavigationSidebar)
 * - the spec-local helpers (openEllipsisMenuFor, getRowCheckbox,
 *   selectItemUsingCheckbox, assertSelectAllIsIndeterminate, ensureCollection*,
 *   moveItemToCollection, findPickerItem, toggleSortingFor,
 *   assertCollectionItemsOrder, archiveAll).
 *
 * Lives in its own file so shared support modules stay untouched
 * (PORTING.md rule 9). Collection drag/drop reuses support/collections.ts
 * dragAndDrop directly (imported by the spec).
 */
import type { Locator, Page, Response } from "@playwright/test";
import { expect } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";
import type { MetabaseApi } from "./api";
import { entityPickerModal } from "./notebook";
import { appBar, icon, navigationSidebar, popover } from "./ui";

type Scope = Page | Locator;

// === Constants not already exported by a shared support module ===

const collections = SAMPLE_INSTANCE_DATA.collections as {
  id: number | string;
  name: string;
  entity_id: string | null;
}[];
const groups = SAMPLE_INSTANCE_DATA.groups as {
  id: number;
  magic_group_type: string | null;
}[];

/** Port of FIRST_COLLECTION_ENTITY_ID (cypress_sample_instance_data.js). */
export const FIRST_COLLECTION_ENTITY_ID = collections.find(
  (c) => c.name === "First collection",
)!.entity_id as string;

/** Port of ALL_USERS_GROUP_ID (cypress_sample_instance_data.js). */
export const ALL_USERS_GROUP_ID = groups.find(
  (g) => g.magic_group_type === "all-internal-users",
)!.id;

/** Mirrors USER_GROUPS.DATA_GROUP (e2e/support/cypress_data.js). */
export const DATA_GROUP = 6;

// === Sidebar helpers ===

/**
 * Port of displaySidebarChildOf (e2e-collections-sidebar.js): click the
 * top-level chevron of the collection's sidebar row to expand it. The Cypress
 * helper walked up from the text to the sidebar-collection-link-root and
 * clicked the first `.Icon-chevronright`; here we resolve the nearest
 * link-root ancestor (xpath `[1]` on the reverse axis = nearest) and click its
 * first chevron, which is the collection's own toggle.
 */
export async function displaySidebarChildOf(page: Page, collectionName: string) {
  const linkRoot = navigationSidebar(page)
    .getByText(collectionName, { exact: true })
    .locator(
      'xpath=ancestor-or-self::*[@data-testid="sidebar-collection-link-root"][1]',
    );
  await icon(linkRoot, "chevronright").first().click();
}

/** Port of H.openCollectionMenu: the collection-menu ellipsis. */
export async function openCollectionMenu(page: Page) {
  await icon(page.getByTestId("collection-menu"), "ellipsis").click();
}

/**
 * Port of H.moveOpenedCollectionTo: open the collection menu, pick Move, wait
 * for the two collection-items loads the entity picker fires, choose the new
 * parent, confirm, and wait for the modal to close.
 */
export async function moveOpenedCollectionTo(page: Page, newParent: string) {
  await openCollectionMenu(page);
  await popover(page).getByText("Move", { exact: true }).click();

  // The Cypress helper waited for two collection-items loads, but the
  // move-opened-collection picker doesn't reliably fire two on the jar (it
  // opens at the tree root). Rely on Playwright auto-waiting for the target
  // item to appear before clicking it.
  const modal = entityPickerModal(page);
  await modal
    .getByTestId("nested-item-picker")
    .getByText(newParent, { exact: true })
    .click();
  await modal.getByRole("button", { name: "Move", exact: true }).click();
  await expect(entityPickerModal(page)).toHaveCount(0);
}

/** Port of H.closeNavigationSidebar. */
export async function closeNavigationSidebar(page: Page) {
  await appBar(page).getByTestId("sidebar-toggle").click();
  await expect(navigationSidebar(page)).toBeHidden();
}

/**
 * Cypress alias for the collection-items GET (any collection id) — resolve
 * after `count` matching responses. Register BEFORE the triggering action.
 */
export function waitForCollectionItems(page: Page, count = 1): Promise<void> {
  let seen = 0;
  return new Promise((resolve) => {
    const handler = (response: Response) => {
      const url = new URL(response.url());
      if (
        response.request().method() === "GET" &&
        /^\/api\/collection\/[^/]+\/items$/.test(url.pathname) &&
        url.search.length > 0
      ) {
        seen += 1;
        if (seen >= count) {
          page.off("response", handler);
          resolve();
        }
      }
    };
    page.on("response", handler);
  });
}

// === Collection-table row helpers ===

/**
 * Port of the spec-local openEllipsisMenuFor: the row ellipsis is hover-gated,
 * so hover the row first. `scope` mirrors the Cypress call sites — some wrap
 * this in `cy.findByTestId("collection-table").within(...)`. The `has` text
 * locator is always built from `page` (not `scope`): a `has` locator anchored
 * to the collection-table can't resolve inside a row, which is its descendant.
 */
export async function openEllipsisMenuFor(
  page: Page,
  item: string,
  scope: Scope = page,
) {
  const row = scope
    .getByRole("row")
    .filter({ has: page.getByText(item, { exact: true }) });
  await row.hover();
  await icon(row, "ellipsis").click({ force: true });
}

/** Port of the spec-local getRowCheckbox. */
export function getRowCheckbox(
  page: Page,
  item: string,
  scope: Scope = page,
): Locator {
  return scope
    .getByRole("row")
    .filter({ has: page.getByText(item, { exact: true }) })
    .getByRole("checkbox");
}

/** Port of the spec-local selectItemUsingCheckbox (click the enclosing button). */
export async function selectItemUsingCheckbox(
  page: Page,
  item: string,
  scope: Scope = page,
) {
  await getRowCheckbox(page, item, scope)
    .locator("xpath=ancestor::button[1]")
    .click();
}

/** Port of the spec-local assertSelectAllIsIndeterminate. */
export async function assertSelectAllIsIndeterminate(
  page: Page,
  isIndeterminate: boolean,
) {
  const checkbox = page.getByLabel("Select all items", { exact: true });
  await expect
    .poll(() =>
      checkbox.evaluate((el) => (el as HTMLInputElement).indeterminate),
    )
    .toBe(isIndeterminate);
}

// === Sidebar tree assertions ===

/**
 * Port of the spec-local ensureCollectionHasNoChildren: the chevron exists but
 * is hidden for a childless collection (metabase#14753).
 */
export async function ensureCollectionHasNoChildren(
  page: Page,
  collection: string,
) {
  const li = navigationSidebar(page)
    .getByText(collection, { exact: true })
    .locator("xpath=ancestor::li[1]");
  await expect(icon(li, "chevronright")).toBeHidden();
}

/** Port of the spec-local ensureCollectionIsExpanded. */
export async function ensureCollectionIsExpanded(
  page: Page,
  collection: string,
  { children = [] }: { children?: string[] } = {},
) {
  const root = navigationSidebar(page)
    .getByText(collection, { exact: true })
    .locator(
      'xpath=ancestor-or-self::*[@data-testid="sidebar-collection-link-root"][1]',
    );
  await expect(icon(root, "chevronright").first()).toBeVisible();

  if (children.length > 0) {
    const ul = root.locator("xpath=following-sibling::ul[1]");
    for (const child of children) {
      await expect(ul.getByText(child, { exact: true })).toBeVisible();
    }
  }
}

// === Entity picker ===

/**
 * Port of the spec-local findPickerItem: the anchor (which carries the
 * data-active / data-disabled attributes) two levels up from the item text.
 * Scoped to the entity picker modal, mirroring the Cypress call sites that
 * wrap it in `entityPickerModal().within(...)`.
 */
export function findPickerItem(page: Page, name: string): Locator {
  return entityPickerModal(page)
    .getByText(name, { exact: true })
    .locator("xpath=ancestor-or-self::a[1]");
}

// === API helpers ===

/** Port of the spec-local moveItemToCollection. */
export async function moveItemToCollection(
  api: MetabaseApi,
  itemName: string,
  collectionName: string,
) {
  const response = await api.get("/api/collection/root/items");
  const items = (await response.json()).data as {
    id: number;
    name: string;
    model: string;
  }[];
  const item = items.find((i) => i.name === itemName)!;
  const collection = items.find((i) => i.name === collectionName)!;
  await api.put(`/api/${item.model}/${item.id}`, {
    collection_id: collection.id,
  });
}

/** Port of the spec-local archiveAll (archive every non-collection root item). */
export async function archiveAll(api: MetabaseApi) {
  const response = await api.get("/api/collection/root/items");
  const items = (await response.json()).data as {
    id: number;
    model: string;
  }[];
  for (const { model, id } of items) {
    if (model !== "collection") {
      await api.put(`/api/${model === "dataset" ? "card" : model}/${id}`, {
        archived: true,
      });
    }
  }
}

// === Collection items listing ===

/** Port of the spec-local toggleSortingFor. */
export async function toggleSortingFor(page: Page, columnName: RegExp) {
  await page.getByTestId("items-table-head").getByText(columnName).click();
}

/** Port of the spec-local assertCollectionItemsOrder. */
export async function assertCollectionItemsOrder(
  page: Page,
  testId: string,
  names: string[],
) {
  for (let index = 0; index < names.length; index++) {
    await expect(page.getByTestId(testId).nth(index)).toHaveText(names[index]);
  }
}

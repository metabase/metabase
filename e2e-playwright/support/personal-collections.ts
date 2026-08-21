/**
 * Helpers for the personal-collections spec port
 * (e2e/test/scenarios/collections/personal-collections.cy.spec.js).
 *
 * Lives in its own file so the shared support modules stay untouched
 * (PORTING.md rule 9). Everything else the spec needs is imported read-only:
 * - ADMIN_PERSONAL_COLLECTION_ID, signInWithCachedSession (permissions.ts)
 * - visitCollection (question-new.ts), createCollection (dashboard-core.ts)
 * - getCollectionActions (collections-cleanup.ts), openCollectionMenu
 *   (collections-core.ts), findByDisplayValue (filters-repros.ts)
 * - startNewCollectionFromSidebar (command-palette.ts), navigationSidebar /
 *   popover / modal / icon / openNavigationSidebar (ui.ts).
 */
import type { Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import { startNewCollectionFromSidebar } from "./command-palette";

// === Constants not exported by a shared support module ===

const collections = SAMPLE_INSTANCE_DATA.collections as {
  id: number | string;
  name: string;
}[];
const users = SAMPLE_INSTANCE_DATA.users as { id: number; email: string }[];

/** Port of NO_DATA_PERSONAL_COLLECTION_ID (cypress_sample_instance_data.js). */
export const NO_DATA_PERSONAL_COLLECTION_ID = Number(
  collections.find((c) => c.name === "No Data Tableton's Personal Collection")!
    .id,
);

/** Port of NORMAL_USER_ID (cypress_sample_instance_data.js). */
export const NORMAL_USER_ID = users.find(
  (u) => u.email === "normal@metabase.test",
)!.id;

/**
 * Mirrors USERS (e2e/support/cypress_data.js) — the map the spec iterates with
 * `Object.keys(USERS)` / `Object.values(USERS)`. That file is untyped JS and
 * not imported by the spike, so the (key, full name) pairs it needs are
 * mirrored here. (PORTING flags a shared USERS name map as a later
 * consolidation candidate.)
 */
export const ALL_TEST_USERS: { key: string; fullName: string }[] = [
  { key: "admin", fullName: "Bobby Tables" },
  { key: "normal", fullName: "Robert Tableton" },
  { key: "nodata", fullName: "No Data Tableton" },
  { key: "sandboxed", fullName: "User 1" },
  { key: "readonly", fullName: "Read Only Tableton" },
  { key: "readonlynosql", fullName: "Read Only Data No Sql Tableton" },
  { key: "nocollection", fullName: "No Collection Tableton" },
  { key: "nosql", fullName: "No SQL Tableton" },
  { key: "none", fullName: "None Tableton" },
  { key: "impersonated", fullName: "User Impersonated" },
];

// === UI helpers ===

/**
 * Port of the spec-local addNewCollection(name): open the new-collection modal
 * from the sidebar, type the name (delay:0 → fill; no debounce dependency),
 * and submit.
 */
export async function addNewCollection(page: Page, name: string) {
  await startNewCollectionFromSidebar(page);
  await page.getByPlaceholder("My new fantastic collection").fill(name);
  await page
    .getByTestId("new-collection-modal")
    .getByRole("button", { name: "Create", exact: true })
    .click();
}

/**
 * Port of `cy.findByPlaceholderText(placeholder).type(text).blur()` on the
 * collection header's EditableText fields (the name field carries placeholder
 * "Add title" even while showing a value). Cypress's `.type()` places the caret
 * at the end of existing text, so it APPENDS — hence "Bar" + "1" → "Bar1". We
 * mirror that: focus, jump to the end, type with real keystrokes
 * (pressSequentially, not fill — EditableText fill() doesn't mark it dirty),
 * then blur to persist.
 */
export async function appendToPlaceholderField(
  page: Page,
  placeholder: string,
  text: string,
) {
  const field = page.getByPlaceholder(placeholder, { exact: true });
  await field.click();
  await field.press("End");
  await field.pressSequentially(text);
  await field.blur();
}

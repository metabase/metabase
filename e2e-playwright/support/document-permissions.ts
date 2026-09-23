/**
 * Helpers for the document-permissions spec port (new module per porting
 * rule 9). Shared document / permission / picker helpers are imported
 * read-only from their existing modules; only the genuinely new bits live
 * here.
 */
import type { Page } from "@playwright/test";

import { newButton, popover } from "./ui";

/** Mirrors USER_GROUPS.ALL_USERS_GROUP (e2e/support/cypress_data.js) — a fixed
 * id baked into the default snapshot. */
export const ALL_USERS_GROUP = 1;

// Re-export the shared collection-graph helper so the spec has a single
// document-permissions import surface (defined in click-behavior.ts).
export { updateCollectionGraph } from "./click-behavior";

/**
 * Port of H.newButton("Document").click(): open the app-bar "New" menu and
 * click the "Document" entry.
 */
export async function newDocumentFromNewMenu(page: Page) {
  await newButton(page).click();
  await popover(page).getByText("Document", { exact: true }).click();
}

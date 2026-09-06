/**
 * Helpers for the embedding theme-*listing* port
 * (e2e/test/scenarios/embedding/embedding-theme-editor/theme-listing.cy.spec.ts).
 *
 * The saved-themes listing lives at /admin/embedding/themes (EE +
 * `pro-self-hosted` token): a grid of theme cards, each with a "Duplicate and
 * delete" action menu, plus the "New theme" card. These are ports of the
 * spec's `./helpers` module (getThemeCard / openThemeActionMenu /
 * clickThemeMenuItem / deleteAllThemes). The theme-*creation* helper
 * (createThemeViaApi) is reused read-only from support/embedding-theme-editor.ts;
 * the shared main() locator comes from support/ui.ts.
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { main } from "./ui";

/** Port of the spec-local getThemeCard: the theme card is the parent element of
 * the exact-text theme name (findByText string → exact, rule 1). */
export function getThemeCard(page: Page, themeName: string) {
  return main(page).getByText(themeName, { exact: true }).locator("..");
}

/** Port of the spec-local openThemeActionMenu: open a theme card's
 * "Duplicate and delete" action menu (findByLabelText → exact, rule 1). */
export async function openThemeActionMenu(page: Page, themeName: string) {
  await getThemeCard(page, themeName)
    .getByLabel("Duplicate and delete", { exact: true })
    .click();
}

/** Port of the spec-local clickThemeMenuItem: open the card's action menu, then
 * click a menuitem by exact name (findByRole name string → exact). The menu
 * portals outside main(), so the menuitem is resolved from the page. */
export async function clickThemeMenuItem(
  page: Page,
  themeName: string,
  menuItemLabel: string,
) {
  await openThemeActionMenu(page, themeName);
  await page
    .getByRole("menuitem", { name: menuItemLabel, exact: true })
    .click();
}

/** Port of the spec-local deleteAllThemes: GET every theme and DELETE it.
 * Runs as the current (admin) user via the shared API client. */
export async function deleteAllThemes(api: MetabaseApi) {
  const response = await api.get("/api/embed-theme");
  const themes = (await response.json()) as { id: number }[];
  for (const theme of themes) {
    await api.fetch("DELETE", `/api/embed-theme/${theme.id}`);
  }
}

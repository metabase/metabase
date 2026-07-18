/**
 * Command palette helpers — ports of
 * e2e/support/helpers/e2e-command-palette-helpers.js plus the handful of
 * one-off helpers the command-palette spec pulls from other Cypress helper
 * files (permissions, actions, collections, profile-link navigation,
 * dashboard-with-tabs creation). Lives in its own module so the shared
 * support files stay untouched.
 */
import { expect } from "@playwright/test";
import type { FrameLocator, Locator, Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import type { MetabaseApi } from "./api";
import { modal } from "./dashboard";
import { navigationSidebar, popover } from "./ui";

/**
 * Ports of ORDERS_BY_YEAR_QUESTION_ID from
 * e2e/support/cypress_sample_instance_data.js (not in support/sample-data.ts,
 * so it's looked up here the same way that file does it).
 */
export const ORDERS_BY_YEAR_QUESTION_ID = findQuestionId(
  "Orders, Count, Grouped by Created At (year)",
);

function findQuestionId(name: string): number {
  const question = SAMPLE_INSTANCE_DATA.questions.find(
    (question) => question.name === name,
  );
  if (!question) {
    throw new Error(
      `Question "${name}" not found in cypress_sample_instance_data`,
    );
  }
  return Number(question.id);
}

/** Port of H.commandPalette. Accepts a FrameLocator for embedding tests. */
export function commandPalette(scope: Page | FrameLocator): Locator {
  return scope.getByTestId("command-palette");
}

/** Port of H.commandPaletteInput (findByPlaceholderText is exact). */
export function commandPaletteInput(scope: Page | Locator): Locator {
  return scope.getByPlaceholder("Search for anything…", { exact: true });
}

/** Port of H.commandPaletteButton. */
export function commandPaletteButton(page: Page): Locator {
  return page
    .getByTestId("app-bar")
    .getByRole("button", { name: /Search|Ask Metabot or search/ });
}

/** Port of H.commandPaletteAction (findByRole name strings are exact). */
export function commandPaletteAction(
  scope: Page | Locator,
  name: string,
): Locator {
  return scope.getByRole("option", { name, exact: true });
}

/**
 * Port of H.openCommandPalette — upstream types both {ctrl+k} and {cmd+k}
 * on the body; ControlOrMeta presses the right one per platform.
 */
export async function openCommandPalette(page: Page) {
  await page.keyboard.press("ControlOrMeta+k");
}

/** Port of H.closeCommandPalette. */
export async function closeCommandPalette(page: Page) {
  await page.keyboard.press("Escape");
}

/**
 * Port of H.openShortcutModal (cy.type "{shift+?}"). The tinykeys binding is
 * "Shift+?" (frontend/src/metabase/palette/shortcuts/global.ts), which needs
 * key === "?" WITH the shift modifier — Playwright's press("Shift+Slash")
 * produces exactly that via the US layout; a bare press("?") would dispatch
 * the key without shiftKey and not match.
 *
 * Self-healing open (see pressShortcut for why keystrokes can be dropped);
 * each attempt waits long enough that a landed press can't be double-toggled
 * by the retry.
 */
export async function openShortcutModal(page: Page) {
  await pressShortcut(page, "Shift+Slash", () =>
    expect(shortcutModal(page)).toBeVisible({ timeout: 1500 }),
  );
}

/** Port of H.shortcutModal. */
export function shortcutModal(page: Page): Locator {
  return page.getByRole("dialog", { name: "Shortcuts", exact: true });
}

/**
 * Press a keyboard shortcut (single key or a tinykeys sequence) and verify it
 * took effect, re-pressing if the keystroke was dropped.
 *
 * kbar tears down and re-attaches its window keydown listener every time any
 * action (re)registers (RTK Query refetches re-register shortcuts at
 * arbitrary times), and keeps it detached while a Mantine modal is open or
 * mid-close-transition — a keystroke landing in one of those windows simply
 * vanishes. Cypress's inter-command latency made drops rare upstream;
 * Playwright's fast dispatch hits them reliably, so ported shortcut presses
 * pair the press with their effect assertion and retry. Give `expectEffect`
 * a short explicit timeout (~3s) so a dropped press retries quickly; the
 * callback doubles as the upstream assertion.
 */
export async function pressShortcut(
  page: Page,
  keys: string | string[],
  expectEffect: () => Promise<unknown>,
  attempts = 4,
) {
  const sequence = Array.isArray(keys) ? keys : [keys];
  for (let attempt = 0; ; attempt++) {
    for (const key of sequence) {
      await page.keyboard.press(key);
    }
    try {
      await expectEffect();
      return;
    } catch (error) {
      if (attempt >= attempts - 1) {
        throw error;
      }
    }
  }
}

/** Port of H.getProfileLink. */
export function getProfileLink(page: Page): Locator {
  return page.getByTestId("app-switcher-target");
}

/** Port of H.getHelpSubmenu. */
export function getHelpSubmenu(page: Page): Locator {
  return page.getByTestId("help-submenu");
}

/** Port of H.goToAdmin. */
export async function goToAdmin(page: Page) {
  await getProfileLink(page).click();
  await popover(page).getByText("Admin", { exact: true }).click();
}

/** Port of H.startNewCollectionFromSidebar. */
export async function startNewCollectionFromSidebar(page: Page) {
  const button = navigationSidebar(page).getByLabel("Create a new collection");
  await expect(button).toBeVisible();
  await button.click();
}

/** Port of H.startNewAction (e2e-action-helpers.js). */
export async function startNewAction(page: Page) {
  await commandPaletteButton(page).click();
  const palette = commandPalette(page);
  await commandPaletteInput(palette).pressSequentially("Ac");
  await palette.getByLabel("New action", { exact: true }).click();
  await expect(palette).toHaveCount(0);
  await expect(page.getByTestId("action-creator")).toBeVisible();
}

/** Port of H.setActionsEnabledForDB. */
export async function setActionsEnabledForDB(
  api: MetabaseApi,
  dbId: number,
  enabled = true,
) {
  await api.put(`/api/database/${dbId}`, {
    settings: { "database-enable-actions": enabled },
  });
}

// createDashboardWithTabs is now canonical in ./factories; re-exported so this
// module's consumers keep their import unchanged.
export { createDashboardWithTabs } from "./factories";

/**
 * Local stand-in for createMockDashboardCard (metabase-types/api/mocks):
 * the spec only needs the positional defaults the API cares about.
 */
export function mockDashboardCard(opts: {
  id: number;
  card_id: number;
  dashboard_tab_id: number;
}): Record<string, unknown> {
  return {
    row: 0,
    col: 0,
    size_x: 1,
    size_y: 1,
    visualization_settings: {},
    parameter_mappings: [],
    ...opts,
  };
}

/**
 * Local stand-in for createMockDocument + cy.request("POST", "/api/document"):
 * the endpoint only reads name/document/collection_id from the mock.
 */
export async function createDocument(
  api: MetabaseApi,
  { collection_id, name = "Test Document" }: {
    collection_id: number;
    name?: string;
  },
) {
  await api.post("/api/document", {
    name,
    document: { type: "doc", content: [] },
    collection_id,
  });
}

/**
 * Port of H.modifyPermission (e2e-permissions-helpers.js): click the
 * permission cell for the row containing `item`, then pick `value` in the
 * popover. (The shouldPropagateToChildren switch branch is unused by this
 * spec and not ported.)
 */
export async function modifyPermission(
  page: Page,
  item: string,
  permissionIndex: number,
  value: string,
) {
  // cy.contains picks the first matching row.
  const row = page
    .getByTestId("permission-table")
    .locator("tbody > tr")
    .filter({ hasText: item })
    .first();
  await row.getByTestId("permissions-select").nth(permissionIndex).click();
  await expect(popover(page)).toHaveCount(1);
  await popover(page).getByText(value, { exact: true }).click();
}

/** Port of H.saveChangesToPermissions. */
export async function saveChangesToPermissions(page: Page) {
  // Upstream aliases both graph endpoints; whichever fires resolves the wait.
  const updatePermissions = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      ["/api/permissions/graph", "/api/ee/advanced-permissions/application/graph"].includes(
        new URL(response.url()).pathname,
      ),
  );
  await page
    .getByTestId("edit-bar")
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  const dialog = modal(page);
  await expect(
    dialog.getByText("Save permissions?", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Are you sure you want to do this?", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Yes", exact: true }).click();
  await updatePermissions;
}

/**
 * Helpers for the admin-permissions port
 * (e2e/test/scenarios/permissions/admin-permissions.cy.spec.js).
 *
 * The row/table/sidebar/save helpers this spec shares with the create-queries
 * port are imported READ-ONLY from support/create-queries.ts and support/ui.ts.
 * The three helpers below have no shared home:
 *
 * - `modifyPermission` — the create-queries / command-palette ports only cover
 *   the two-arg-plus-value form; this spec needs the full upstream signature
 *   (the "Also change sub-collections" propagate toggle, and a `null` value
 *   that toggles-only). Ported here from e2e-permissions-helpers.js.
 * - `assertSidebarItems` / `assertPermissionOptions` — the sidebar/option
 *   assertions from e2e-permissions-helpers.js, not needed by earlier ports.
 *
 * Lives in its own file so shared support modules stay untouched
 * (PORTING.md rule 9).
 */
import type { Page } from "@playwright/test";

import { selectPermissionRow } from "./create-queries";
import { expect } from "./fixtures";
import { popover } from "./ui";

/** Mirrors USER_GROUPS (e2e/support/cypress_data.js) — fixed ids baked into
 * the `default` snapshot. ALL_USERS_GROUP is re-exported from create-queries. */
export const ADMIN_GROUP = 2;
export const COLLECTION_GROUP = 5;
export const DATA_GROUP = 6;
export const READONLY_GROUP = 7;
export const NOSQL_GROUP = 8;

/**
 * Port of H.modifyPermission (e2e-permissions-helpers.js): open the row's
 * permission popover, optionally flip the "Also change sub-collections"
 * switch to `shouldPropagateToChildren`, then (if `value` is set) pick it.
 *
 * `shouldPropagateToChildren === null` (the default) leaves the toggle alone;
 * `value === null` toggles only without changing the level.
 */
export async function modifyPermission(
  page: Page,
  item: string,
  permissionIndex: number,
  value: string | null,
  shouldPropagateToChildren: boolean | null = null,
) {
  await selectPermissionRow(page, item, permissionIndex);

  const pop = popover(page);
  await expect(pop).toHaveCount(1);

  if (shouldPropagateToChildren !== null) {
    // Mantine Switch: click the role="switch" input (force — the label
    // overlays it), and only if it isn't already in the wanted state.
    const toggle = pop.getByRole("switch");
    if ((await toggle.isChecked()) !== shouldPropagateToChildren) {
      await toggle.click({ force: true });
    }
  }

  if (value !== null) {
    // findByText(value) with a string arg is an exact match (PORTING rule 1).
    await pop.getByText(value, { exact: true }).click();
  }
}

/**
 * Port of H.assertSidebarItems: the sidebar's menuitems have exactly these
 * texts, in order. `have.text` is an exact (trimmed) match, and upstream's
 * `.each` over the found set requires the counts to line up — toHaveText with
 * an array asserts both count and per-item text.
 */
export async function assertSidebarItems(page: Page, items: string[]) {
  await expect(page.getByRole("menuitem")).toHaveText(items);
}

/**
 * Port of H.assertPermissionOptions: the open permission popover shows exactly
 * these options, in order. findByText(option) with a string is an exact match.
 */
export async function assertPermissionOptions(page: Page, options: string[]) {
  const optionEls = popover(page).getByRole("option");
  await expect(optionEls).toHaveCount(options.length);
  for (let index = 0; index < options.length; index++) {
    await expect(
      optionEls.nth(index).getByText(options[index], { exact: true }),
    ).toBeVisible();
  }
}

/**
 * Port of the split-permission tests' `cy.intercept("/api/session/properties",
 * req => req.continue(res => res.body = {...res.body, ...tempState}))`: fetch
 * the real response and merge `getExtra()` into it on every request. Uses
 * native fetch, not route.fetch() — the latter chokes on the backend's
 * set-cookie headers under bun (same workaround as mockSessionProperty in
 * admin-extras.ts). `getExtra` is read per-request so a mutating `tempState`
 * closure is reflected. Register before page.goto.
 */
export async function mockSessionPropertiesMerging(
  page: Page,
  getExtra: () => Record<string, unknown>,
) {
  await page.route(
    (url) => url.pathname === "/api/session/properties",
    async (route) => {
      const request = route.request();
      const response = await fetch(request.url(), {
        headers: await request.allHeaders(),
      });
      const body = (await response.json()) as Record<string, unknown>;
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify({ ...body, ...getExtra() }),
      });
    },
  );
}

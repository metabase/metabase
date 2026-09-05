/**
 * Helpers for the downgrade-ee-to-oss permissions port
 * (e2e/test/scenarios/permissions/downgrade-ee-to-oss.cy.spec.js).
 *
 * Reused read-only from existing modules:
 * - `modifyPermission` from support/command-palette.ts
 * - `assertPermissionTable` / `getPermissionRowPermissions` from
 *   support/create-queries.ts
 * - `modal` / `popover` from support/ui.ts
 * - `deleteToken` from support/admin-extras.ts, `api.activateToken` from
 *   support/api.ts
 *
 * What's new here is the sandboxing ("Row and column security") modal flow and
 * `isPermissionDisabled`, neither of which had a port yet.
 */
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { getPermissionRowPermissions } from "./create-queries";
import { modal, popover } from "./ui";

/** The spec's EE_DATA_ACCESS_PERMISSION_INDEX (the view-data column in EE). */
export const EE_DATA_ACCESS_PERMISSION_INDEX = 0;

/**
 * The spec's OSS_NATIVE_QUERIES_PERMISSION_INDEX. Same numeric index as the EE
 * one — the point of the spec is that column 0 *means* something different once
 * the token is gone (view-data disappears, create-queries slides into slot 0).
 */
export const OSS_NATIVE_QUERIES_PERMISSION_INDEX = 0;

/**
 * Port of H.isPermissionDisabled (e2e-permissions-helpers.js):
 * `getPermissionRowPermissions(row).eq(index)` must carry
 * `aria-disabled="<isDisabled>"` and contain `permission`.
 *
 * `aria-disabled` is not one of jQuery's boolean attributes, so upstream's
 * two-arg `have.attr` really is a value comparison — port it as one
 * (`PermissionsSelect` renders `aria-disabled={isDisabled}`, which React
 * stringifies to "true"/"false" either way).
 *
 * `.contains()` is a substring check, so this is `toContainText`, not
 * `toHaveText`.
 */
export async function isPermissionDisabled(
  page: Page,
  row: string,
  index: number,
  permission: string,
  isDisabled: boolean,
) {
  const cell = getPermissionRowPermissions(page, row).nth(index);
  await expect(cell).toHaveAttribute("aria-disabled", String(isDisabled));
  await expect(cell).toContainText(permission);
}

/**
 * Port of the spec's inline save flow:
 *
 *   cy.button("Save changes").click();
 *   H.modal().within(() => {
 *     cy.findByText("Save permissions?");
 *     cy.button("Yes").click();
 *   });
 *
 * Two deliberate strengthenings, both noted in findings:
 * - upstream's bare `cy.findByText("Save permissions?")` is an implicit
 *   existence assertion; ported as a real visibility assertion.
 * - the graph PUT is awaited. Upstream never waits, but Cypress's command queue
 *   always paced the following `H.deleteToken()` / `cy.reload()` past it; in
 *   Playwright the API call and the reload fire back-to-back and can beat the
 *   save. This anchors on the change being saved (the PORTING "anchor
 *   saveDashboard on the change it saves" rule).
 */
export async function saveAndConfirmPermissions(page: Page) {
  const updatePermissions = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/api/permissions/graph",
  );

  await page.getByRole("button", { name: "Save changes", exact: true }).click();

  const dialog = modal(page);
  await expect(
    dialog.getByText("Save permissions?", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Yes", exact: true }).click();

  await updatePermissions;
  await expect(modal(page)).toHaveCount(0);
}

/**
 * Port of the spec's sandboxing-modal block: after picking "Row and column
 * security" the EditSandboxingModal opens, and the test fills in
 * column → user attribute → Save.
 *
 * `Pick a column` is the QuestionParameterTargetWidget trigger (a
 * TippyPopover — the shared `popover()` selector), `Pick a user attribute` is a
 * Mantine `Select`, whose rows are picked by `role="option"` rather than by
 * clicking the text div (PORTING wave-10 gotcha).
 */
export async function configureSandboxPolicy(
  page: Page,
  columnName: string,
  userAttribute: string,
) {
  const dialog = modal(page);

  await dialog.getByText("Pick a column", { exact: true }).click();
  await popover(page).getByText(columnName, { exact: true }).click();

  await dialog.getByPlaceholder("Pick a user attribute").click();
  await page.getByRole("option", { name: userAttribute, exact: true }).click();

  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

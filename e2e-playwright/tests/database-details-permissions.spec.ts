/**
 * Playwright port of
 * e2e/test/scenarios/permissions/database-details-permissions.cy.spec.js
 *
 * A single test: grant the "Manage database" (details) permission to All Users,
 * then check what a non-admin database manager can and cannot do.
 *
 * Port notes:
 * - EE: upstream calls `H.activateToken("pro-self-hosted")` (the details
 *   permission column only exists with a token). Gated with
 *   `test.skip(!resolveToken(...))` per PORTING rule 7.
 * - The save-and-confirm block is byte-identical to the spec-local
 *   `savePermissionsGraph` already ported for data-model-permissions — reused
 *   rather than re-implemented (consolidation toward a shape Cypress has).
 * - `cy.get("nav").should("contain", X).and("not.contain", Y)` is an ANY-of-set
 *   assertion (chai-jquery resolves `contain` to `$el.is(":contains(...)")`,
 *   which is true if ANY matched element contains the text). Ported as
 *   filter-by-text count assertions, with case-sensitive substring regexes
 *   (jQuery `:contains` is case-sensitive; Playwright's hasText string is not).
 * - `cy.location("pathname").should("eq", ...)` retries in Cypress → expect.poll.
 * - The `cy.request DELETE /api/database/:id` runs as the *normal* user in
 *   Cypress (cy.request rides the browser cookie session). `mb.signInAsNormalUser`
 *   switches the api client's session token too, so `mb.api.fetch("DELETE", …)`
 *   is the same actor.
 * - `cy.button(x).should("exist")` → toBeAttached (existence, not visibility);
 *   `should("not.exist")` → toHaveCount(0), which retries exactly as Cypress
 *   does. Both absence assertions are anchored on a positive signal inside the
 *   same section (a sibling button that IS present), so they cannot pass merely
 *   because the section had not rendered.
 */
import { modifyPermission } from "../support/admin-permissions";
import { resolveToken } from "../support/api";
import { goToAdmin } from "../support/command-palette";
import { savePermissionsGraph } from "../support/data-model-permissions";
import { assertPermissionForItem } from "../support/download-permissions";
import { test, expect } from "../support/fixtures";
import { SAMPLE_DB_ID } from "../support/sample-data";
import { caseSensitiveSubstring } from "../support/text";

const DETAILS_PERMISSION_INDEX = 4;

test.describe("scenarios > admin > permissions > database details permissions", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "EE database-details permissions require the pro-self-hosted token",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("allows database managers to see and edit database details but not to delete a database (metabase#22293)", async ({
    page,
    mb,
  }) => {
    // As an admin, grant database details permissions to all users
    await page.goto(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
    await modifyPermission(page, "All Users", DETAILS_PERMISSION_INDEX, "Yes");

    await savePermissionsGraph(page);

    await assertPermissionForItem(
      page,
      "All Users",
      DETAILS_PERMISSION_INDEX,
      "Yes",
    );

    // Normal user should now have the ability to manage databases
    await mb.signInAsNormalUser();

    await page.goto("/");
    await goToAdmin(page);

    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe("/admin/databases");

    const nav = page.locator("nav");
    await expect(
      nav.filter({ hasText: caseSensitiveSubstring("Databases") }),
    ).not.toHaveCount(0);
    await expect(
      nav.filter({ hasText: caseSensitiveSubstring("Settings") }),
    ).toHaveCount(0);
    await expect(
      nav.filter({ hasText: caseSensitiveSubstring("Data Model") }),
    ).toHaveCount(0);

    await page.getByText("Sample Database", { exact: true }).click();

    const connectionInfo = page.getByTestId(
      "database-connection-info-section",
    );
    await expect(
      connectionInfo.getByRole("button", {
        name: "Sync database schema",
        exact: true,
      }),
    ).toBeAttached();
    await expect(
      connectionInfo.getByRole("button", {
        name: "Re-scan field values",
        exact: true,
      }),
    ).toBeAttached();

    const dangerZone = page.getByTestId("database-danger-zone-section");
    await expect(
      dangerZone.getByRole("button", {
        name: "Discard saved field values",
        exact: true,
      }),
    ).toBeAttached();
    await expect(
      dangerZone.getByRole("button", {
        name: "Remove this database",
        exact: true,
      }),
    ).toHaveCount(0);

    const deleteResponse = await mb.api.fetch(
      "DELETE",
      `/api/database/${SAMPLE_DB_ID}`,
      { failOnStatusCode: false },
    );
    expect(deleteResponse.status()).toBe(403);

    // should not allow access to the database/create page (metabase-private#236)
    await page.goto("/admin/databases/create");
    await expect(page.getByRole("img", { name: /key/ })).toBeAttached();
    await expect(page.getByRole("status")).toContainText(
      "Sorry, you don’t have permission to see that.",
    );
  });
});

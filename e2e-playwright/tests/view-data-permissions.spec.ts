/**
 * Playwright port of e2e/test/scenarios/permissions/view-data.cy.spec.js
 *
 * Infra tier (measured, not inferred from the `@external` tag):
 * - 15 of the 22 tests need NO container at all — they restore the `default`
 *   H2 snapshot and drive the admin permissions UI.
 * - 7 tests genuinely do need the QA Postgres 12 container: the whole
 *   `impersonated` describe (6) and the second `reproductions` test (1). They
 *   `restore("postgres-12")` and `createTestRoles({ type: "postgres" })`, which
 *   opens a real connection to postgres://localhost:5404. Those are gated on
 *   PW_QA_DB_ENABLED (the deliberate gate — QA_DB_ENABLED leaks truthy from
 *   cypress.env.json on dev machines).
 *
 * Token: every describe except the OSS-shaped `granular` one activates
 * `pro-self-hosted`, and the gate is real — see findings-inbox for the
 * remove-the-token probe. The bare `granular` describe deliberately runs
 * token-less (restore resets `premium-embedding-token`) and asserts the
 * View data column is absent, so it must NOT be given a token.
 *
 * Fidelity notes (see findings-inbox/view-data-permissions.md):
 * - `H.assertPermissionForItem` takes THREE parameters
 *   (item, permissionColumnIndex, permissionValue). This spec calls it with a
 *   FOURTH argument in 12 places (`..., "No", true`), evidently meaning
 *   "and it is disabled". That argument is silently discarded by the helper —
 *   the disabled-ness is never asserted. Ported verbatim (the 4th arg simply
 *   isn't passed) with the upstream call recorded in a comment at each site,
 *   per the "port an upstream vacuous assertion verbatim, especially on a
 *   security surface" rule.
 * - `assertCollectionGroupUserHasAccess` / `assertCollectionGroupHasNoAccess`
 *   take an `isQbQuestion` argument that neither function uses. Kept in the
 *   signature so the call sites read the same.
 * - The legacy-no-self-service test registers its `cy.intercept` AFTER
 *   `cy.reload()`; see the comment at that site for why the port registers it
 *   before.
 *
 * Helper reuse: the row/table/sidebar/modify helpers are imported read-only
 * from support/create-queries.ts, support/admin-permissions.ts,
 * support/download-permissions.ts, support/downgrade-ee-to-oss.ts and
 * support/ui.ts. Only what had no home lives in support/view-data-permissions.ts.
 */
import {
  COLLECTION_GROUP,
  modifyPermission,
} from "../support/admin-permissions";
import { resolveToken } from "../support/api";
import { tooltip } from "../support/charts";
import {
  ALL_USERS_GROUP,
  getPermissionRowPermissions,
  permissionTable,
  selectPermissionRow,
  selectSidebarItem,
} from "../support/create-queries";
import { assertPermissionForItem } from "../support/download-permissions";
import { isPermissionDisabled } from "../support/downgrade-ee-to-oss";
import { createNativeQuestion } from "../support/factories";
import { expect, test } from "../support/fixtures";
import {
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import { modal, popover, visitQuestion } from "../support/ui";
import {
  CREATE_QUERIES_PERM_IDX,
  DATA_ACCESS_PERM_IDX,
  DOWNLOAD_PERM_IDX,
  QA_DB_SKIP_REASON,
  assertPermissionTable,
  assertSameBeforeAndAfterSave,
  configureSandboxColumnAndAttribute,
  configureSandboxColumnAndAttributeInModal,
  createTestRoles,
  lackPermissionsView,
  makeOrdersSandboxed,
  savePermissions,
  saveImpersonationSettings,
  selectImpersonatedAttribute,
} from "../support/view-data-permissions";

import type { Page } from "@playwright/test";

const { ORDERS_ID } = SAMPLE_DATABASE;

const TOKEN_SKIP_REASON =
  "needs the pro-self-hosted token (EE view-data permissions)";

/** Register a wait for the next PUT /api/permissions/graph ("@saveGraph"). */
function waitForSaveGraph(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/api/permissions/graph",
  );
}

// EDITOR RELATED TESTS

test.describe("scenarios > admin > permissions > view data > blocked", () => {
  test.skip(!resolveToken("pro-self-hosted"), TOKEN_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  const g = "All Users";

  test("should allow saving 'blocked' and disable create queries dropdown when set", async ({
    page,
  }) => {
    await page.goto(
      // table level
      `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC/table/${ORDERS_ID}`,
    );

    // Upstream passes a 4th `false` argument here — H.assertPermissionForItem
    // has no 4th parameter, so it is discarded (see the spec header).
    await assertPermissionForItem(page, g, DATA_ACCESS_PERM_IDX, "Can view");
    await assertPermissionForItem(page, g, CREATE_QUERIES_PERM_IDX, "No");
    await assertPermissionForItem(
      page,
      g,
      DOWNLOAD_PERM_IDX,
      "1 million rows",
    );

    await modifyPermission(page, g, DATA_ACCESS_PERM_IDX, "Blocked");

    await assertSameBeforeAndAfterSave(page, async () => {
      await assertPermissionForItem(page, g, DATA_ACCESS_PERM_IDX, "Blocked");
      // Upstream's 4th argument `true` ("is disabled") is discarded.
      await assertPermissionForItem(page, g, CREATE_QUERIES_PERM_IDX, "No");
      await assertPermissionForItem(page, g, DOWNLOAD_PERM_IDX, "No");
    });

    // assert that user properly sees native query warning related to table
    // level blocking
    await getPermissionRowPermissions(page, "All Users")
      .nth(DATA_ACCESS_PERM_IDX)
      .getByLabel("warning icon", { exact: true })
      .hover();

    await expect(
      page
        .getByRole("tooltip")
        .getByText(
          /Groups with a database, schema, or table set to Blocked can't view native queries on this database/,
        ),
    ).toHaveCount(1);

    await page.goto(`/admin/permissions/data/database/${SAMPLE_DB_ID}`); // database level

    await assertPermissionForItem(page, g, DATA_ACCESS_PERM_IDX, "Granular");
    await assertPermissionForItem(page, g, CREATE_QUERIES_PERM_IDX, "No");
    await assertPermissionForItem(page, g, DOWNLOAD_PERM_IDX, "Granular");

    await modifyPermission(page, g, DATA_ACCESS_PERM_IDX, "Blocked");

    await assertSameBeforeAndAfterSave(page, async () => {
      await assertPermissionForItem(page, g, DATA_ACCESS_PERM_IDX, "Blocked");
      await assertPermissionForItem(page, g, CREATE_QUERIES_PERM_IDX, "No");
      await assertPermissionForItem(page, g, DOWNLOAD_PERM_IDX, "No");
    });
  });

  test("should prevent user from upgrading db/schema create query permissions if a child schema/table contains blocked permissions", async ({
    page,
  }) => {
    await page.goto(
      `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}`,
    ); // table level

    // ensure that modify tables do not affect other rows.
    // this is the test is admittedly a little opaque, we're trying to test that
    // the calculation that upgrades view data permissions does not apply to tables
    await modifyPermission(page, "Orders", DATA_ACCESS_PERM_IDX, "Blocked"); // add blocked to one table
    await modifyPermission(
      page,
      "Products",
      CREATE_QUERIES_PERM_IDX,
      "Query builder only",
    ); // increase permissions of another table to trigger upgrade flow
    await assertPermissionForItem(
      page,
      "Orders",
      DATA_ACCESS_PERM_IDX,
      "Blocked",
    ); // orders table should stay the same

    await selectSidebarItem(page, "All Users");
    await assertPermissionForItem(
      page,
      "Sample Database",
      DATA_ACCESS_PERM_IDX,
      "Granular",
    );
    await modifyPermission(
      page,
      "Sample Database",
      CREATE_QUERIES_PERM_IDX,
      "Query builder only",
    );

    const dialog = modal(page);
    await expect(dialog).toHaveCount(1);
    await expect(
      dialog.getByText(
        "This will also set the View Data permission to “Can View” to allow this group to create queries. Okay?",
        { exact: true },
      ),
    ).toBeVisible();
    await dialog.getByText("Okay", { exact: true }).click();

    await assertPermissionForItem(
      page,
      "Sample Database",
      DATA_ACCESS_PERM_IDX,
      "Can view",
    );
    await assertPermissionForItem(
      page,
      "Sample Database",
      CREATE_QUERIES_PERM_IDX,
      "Query builder only",
    );
  });
});

test.describe("scenarios > admin > permissions > view data > granular", () => {
  // NOTE: deliberately token-less. restore() resets premium-embedding-token,
  // and the assertion is that the EE-only "View data" column is absent.
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not allow making permissions granular in the either database or group focused view", async ({
    page,
  }) => {
    await page.goto(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);

    await expect(
      page.locator("main").getByText("View data", { exact: true }),
    ).toHaveCount(0);

    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    await expect(
      page.locator("main").getByText("View data", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("scenarios > admin > permissions > view data > granular (EE)", () => {
  // Upstream declares a SECOND describe with the identical title
  // "scenarios > admin > permissions > view data > granular". Suffixed here;
  // duplicate suite titles are legal in Playwright but make the two blocks
  // indistinguishable in reports.
  test.skip(!resolveToken("pro-self-hosted"), TOKEN_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should allow making permissions granular in the database focused view", async ({
    page,
  }) => {
    await page.goto(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);

    await modifyPermission(page, "All Users", DATA_ACCESS_PERM_IDX, "Granular");

    await expect(page).toHaveURL(
      new RegExp(
        `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}`,
      ),
    );

    await makeOrdersSandboxed(page, {
      allUsersGroup: ALL_USERS_GROUP,
      sampleDbId: SAMPLE_DB_ID,
      ordersId: ORDERS_ID,
    });

    await selectSidebarItem(page, "All Users");

    await assertPermissionTable(page, [
      ["Sample Database", "Granular", "No", "1 million rows", "No", "No", "No"],
    ]);

    const saveGraph = waitForSaveGraph(page);
    await page.getByRole("button", { name: "Save changes", exact: true }).click();

    const dialog = modal(page);
    await expect(
      dialog.getByText("Save permissions?", { exact: true }),
    ).toBeVisible();
    // cy.contains — case-sensitive substring, first match.
    await expect(
      dialog
        .getByText(
          /All Users will be given access to 1 table in Sample Database/,
        )
        .first(),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Yes", exact: true }).click();

    expect((await saveGraph).status()).toBe(200);
  });

  test("should allow making permissions granular in the group focused view", async ({
    page,
  }) => {
    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    await modifyPermission(
      page,
      "Sample Database",
      DATA_ACCESS_PERM_IDX,
      "Granular",
    );

    await expect(page).toHaveURL(
      new RegExp(
        `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}`,
      ),
    );

    await makeOrdersSandboxed(page, {
      allUsersGroup: ALL_USERS_GROUP,
      sampleDbId: SAMPLE_DB_ID,
      ordersId: ORDERS_ID,
    });

    await selectSidebarItem(page, "All Users");

    await assertPermissionTable(page, [
      ["Sample Database", "Granular", "No", "1 million rows", "No", "No", "No"],
    ]);

    const saveGraph = waitForSaveGraph(page);
    await page.getByRole("button", { name: "Save changes", exact: true }).click();

    const dialog = modal(page);
    await expect(
      dialog.getByText("Save permissions?", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog
        .getByText(
          /All Users will be given access to 1 table in Sample Database/,
        )
        .first(),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Yes", exact: true }).click();

    expect((await saveGraph).status()).toBe(200);
  });

  test("should infer parent permissions if all granular permissions are equal", async ({
    page,
  }) => {
    // TODO: this feature (not test) is broken when changing permissions for all schemas to the samve value

    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    await modifyPermission(
      page,
      "Sample Database",
      DATA_ACCESS_PERM_IDX,
      "Granular",
    );

    await makeOrdersSandboxed(page, {
      allUsersGroup: ALL_USERS_GROUP,
      sampleDbId: SAMPLE_DB_ID,
      ordersId: ORDERS_ID,
    });

    await selectSidebarItem(page, "All Users");

    await assertPermissionTable(page, [
      ["Sample Database", "Granular", "No", "1 million rows", "No", "No", "No"],
    ]);

    // cy.findByTestId("permission-table").find("tbody > tr")
    //   .contains("Sample Database").closest("a").click()
    await permissionTable(page)
      .locator("tbody > tr")
      .filter({ hasText: /Sample Database/ })
      .first()
      .locator("a")
      .first()
      .click();

    await modifyPermission(page, "Orders", DATA_ACCESS_PERM_IDX, "Can view");

    await selectSidebarItem(page, "All Users");

    await assertPermissionTable(page, [
      ["Sample Database", "Can view", "No", "1 million rows", "No", "No", "No"],
    ]);
  });

  test("should preserve parent value for children when selecting granular for permissions available to child entities", async ({
    page,
  }) => {
    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    await modifyPermission(
      page,
      "Sample Database",
      DATA_ACCESS_PERM_IDX,
      "Blocked",
    );

    await modifyPermission(
      page,
      "Sample Database",
      DATA_ACCESS_PERM_IDX,
      "Granular",
    );

    await assertPermissionForItem(
      page,
      "Orders",
      DATA_ACCESS_PERM_IDX,
      "Blocked",
    );
  });
});

test.describe("scenarios > admin > permissions > view data > impersonated", () => {
  // Upstream tag: "@external" — and here the tag is honest: the describe
  // restores the `postgres-12` snapshot and opens a knex connection to the QA
  // Postgres container to create the `orders_products_access` role.
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);
  test.skip(!resolveToken("pro-self-hosted"), TOKEN_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-12");
    await createTestRoles();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should allow saving 'impersonated' permissions", async ({ page }) => {
    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    // Check there is no Impersonated option on H2
    await selectPermissionRow(page, "Sample Database", DATA_ACCESS_PERM_IDX);
    await expect(popover(page)).not.toContainText("Impersonated");

    // Set impersonated access on Postgres database
    await modifyPermission(
      page,
      "QA Postgres12",
      DATA_ACCESS_PERM_IDX,
      "Impersonated",
    );

    await selectImpersonatedAttribute(page, "role");
    await saveImpersonationSettings(page);
    await savePermissions(page);

    await assertPermissionTable(page, [
      ["Sample Database", "Can view", "No", "1 million rows", "No", "No", "No"],
      ["QA Postgres12", "Impersonated", "No", "1 million rows", "No", "No", "No"],
    ]);

    // Checking it shows the right state on the tables level
    await page
      .locator("main")
      .getByText("QA Postgres12", { exact: true })
      .click();

    await assertPermissionTable(
      page,
      [
        "Accounts",
        "Analytic Events",
        "Feedback",
        "Invoices",
        "Orders",
        "People",
        "Products",
        "Reviews",
      ].map((tableName) => [
        tableName,
        "Impersonated",
        "No",
        "1 million rows",
        "No",
        "No",
      ]),
    );

    // Return back to the database view
    await page
      .locator("main")
      .getByText("All Users group", { exact: true })
      .click();

    // Edit impersonated permission
    await modifyPermission(
      page,
      "QA Postgres12",
      DATA_ACCESS_PERM_IDX,
      "Edit Impersonated",
    );

    await selectImpersonatedAttribute(page, "attr_uid");
    await saveImpersonationSettings(page);
    await savePermissions(page);

    await assertPermissionTable(page, [
      ["Sample Database", "Can view", "No", "1 million rows", "No", "No", "No"],
      ["QA Postgres12", "Impersonated", "No", "1 million rows", "No", "No", "No"],
    ]);
  });

  test("should warn when All Users group has 'impersonated' access and the target group has unrestricted access", async ({
    page,
  }) => {
    await page.goto(`/admin/permissions/data/group/${COLLECTION_GROUP}`);

    await modifyPermission(
      page,
      "QA Postgres12",
      DATA_ACCESS_PERM_IDX,
      "Impersonated",
    );

    // Warns that All Users group has greater access
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText(
        'Revoke access even though "All Users" has greater access?',
        { exact: true },
      ),
    ).toBeVisible();
    await dialog.getByText("Revoke access", { exact: true }).click();

    await selectImpersonatedAttribute(page, "role");
    await saveImpersonationSettings(page);
    await savePermissions(page);

    await getPermissionRowPermissions(page, "QA Postgres12")
      .nth(DATA_ACCESS_PERM_IDX)
      .getByLabel("warning icon", { exact: true })
      .hover();

    await expect(
      tooltip(page).getByText(
        'The "All Users" group has a higher level of access than this, which will override this setting. You should limit or revoke the "All Users" group\'s access to this item.',
        { exact: true },
      ),
    ).toBeVisible();
  });

  test("allows switching to the granular access and update table permissions", async ({
    page,
  }) => {
    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    await modifyPermission(
      page,
      "QA Postgres12",
      DATA_ACCESS_PERM_IDX,
      "Impersonated",
    );

    await selectImpersonatedAttribute(page, "role");
    await saveImpersonationSettings(page);
    await savePermissions(page);

    await modifyPermission(
      page,
      "QA Postgres12",
      DATA_ACCESS_PERM_IDX,
      "Granular",
    );

    // Resets table permissions from Impersonated to Can view
    await assertPermissionTable(
      page,
      [
        "Accounts",
        "Analytic Events",
        "Feedback",
        "Invoices",
        "Orders",
        "People",
        "Products",
        "Reviews",
      ].map((tableName) => [
        tableName,
        "Can view",
        "No",
        "1 million rows",
        "No",
        "No",
      ]),
    );

    // Return back to the database view
    await page
      .locator("main")
      .getByText("All Users group", { exact: true })
      .click();

    // On database level it got reset to Can view too
    await assertPermissionTable(page, [
      ["Sample Database", "Can view", "No", "1 million rows", "No", "No", "No"],
      ["QA Postgres12", "Can view", "No", "1 million rows", "No", "No", "No"],
    ]);
  });

  test("impersonation modal should be positioned behind the page leave confirmation modal", async ({
    page,
  }) => {
    // Try leaving the page
    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    await modifyPermission(
      page,
      "QA Postgres12",
      DATA_ACCESS_PERM_IDX,
      "Impersonated",
    );

    await selectImpersonatedAttribute(page, "role");
    await saveImpersonationSettings(page);

    await modifyPermission(
      page,
      "QA Postgres12",
      DATA_ACCESS_PERM_IDX,
      "Edit Impersonated",
    );

    await page
      .getByRole("dialog")
      .getByText("Edit settings", { exact: true })
      .click();

    // Page leave confirmation should be on top
    const leaveConfirmation = page.getByTestId("leave-confirmation");
    await expect(
      leaveConfirmation.getByText("Discard your changes?", { exact: true }),
    ).toBeVisible();

    // Cancel page leave
    await leaveConfirmation.getByText("Cancel", { exact: true }).click();

    // Ensure the impersonation modal is still open
    await expect(
      page
        .getByRole("dialog")
        .getByText("Map a user attribute to database roles", { exact: true }),
    ).toBeVisible();

    // Go to settings
    await page
      .getByRole("dialog")
      .getByText("Edit settings", { exact: true })
      .click();
    await leaveConfirmation
      .getByText("Discard changes", { exact: true })
      .click();

    // cy.focused().should("have.attr", "placeholder", "username")
    await expect(page.locator(":focus")).toHaveAttribute(
      "placeholder",
      "username",
    );
  });

  test("should set unrestricted for children if database is set to impersonated before going granular", async ({
    page,
  }) => {
    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    await modifyPermission(
      page,
      "QA Postgres12",
      DATA_ACCESS_PERM_IDX,
      "Impersonated",
    );

    await selectImpersonatedAttribute(page, "role");
    await saveImpersonationSettings(page);

    await modifyPermission(
      page,
      "Sample Database",
      DATA_ACCESS_PERM_IDX,
      "Granular",
    );

    await assertPermissionForItem(
      page,
      "Orders",
      DATA_ACCESS_PERM_IDX,
      "Can view",
    );
  });
});

test.describe("scenarios > admin > permissions > view data > legacy no self-service", () => {
  test.skip(!resolveToken("pro-self-hosted"), TOKEN_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("'no self service' should only be an option if it is the current value in the permissions graph", async ({
    page,
  }) => {
    // load the page like normal w/o legacy value in the graph
    // and test that it does not exist
    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    await selectPermissionRow(page, "Sample Database", DATA_ACCESS_PERM_IDX);
    await expect(popover(page)).not.toContainText("No self-service (Deprecated)");

    await selectPermissionRow(page, "Sample Database", CREATE_QUERIES_PERM_IDX);

    await isPermissionDisabled(
      page,
      "Sample Database",
      CREATE_QUERIES_PERM_IDX,
      "No",
      false,
    );

    // load the page w/ legacy value in the graph and test that it does exist.
    //
    // Upstream writes `cy.reload()` and only THEN `cy.intercept(...)`. Because
    // Cypress queues commands, the intercept is registered a tick after the
    // reload resolves and beats the app's graph fetch only by a race (the app
    // has to boot React first). Registering the route before the reload is the
    // same intent, deterministically — the alternative in Playwright is the
    // same race with no command queue to soften it.
    await page.route(
      (url) =>
        url.pathname === `/api/permissions/graph/group/${ALL_USERS_GROUP}`,
      async (route) => {
        if (route.request().method() !== "GET") {
          return route.fallback();
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            revision: 1,
            groups: {
              1: {
                1: {
                  "view-data": "legacy-no-self-service",
                  "create-queries": "no",
                  download: { schemas: "full" },
                },
              },
            },
          }),
        });
      },
    );
    await page.reload();

    await assertPermissionTable(page, [
      [
        "Sample Database",
        "No self-service (Deprecated)",
        "No",
        "1 million rows",
        "No",
        "No",
        "No",
      ],
    ]);

    // User should not be able to modify Create queries permission while set to legacy-no-self-service
    await isPermissionDisabled(
      page,
      "Sample Database",
      CREATE_QUERIES_PERM_IDX,
      "No",
      true,
    );

    await modifyPermission(
      page,
      "Sample Database",
      DATA_ACCESS_PERM_IDX,
      "Can view",
    );

    await modifyPermission(
      page,
      "Sample Database",
      CREATE_QUERIES_PERM_IDX,
      "Query builder and native",
    );

    await modifyPermission(
      page,
      "Sample Database",
      DATA_ACCESS_PERM_IDX,
      "No self-service (Deprecated)",
    );

    // change something else so we can save
    await modifyPermission(page, "Sample Database", DOWNLOAD_PERM_IDX, "No");

    // User setting the value back to legacy-no-self-service should result in Create queries going back to No
    const finalExpectedRows = [
      [
        "Sample Database",
        "No self-service (Deprecated)",
        "No",
        "No",
        "No",
        "No",
        "No",
      ],
    ];
    await assertPermissionTable(page, finalExpectedRows);

    const saveGraph = waitForSaveGraph(page);

    await page.getByRole("button", { name: "Save changes", exact: true }).click();

    const dialog = modal(page);
    await expect(
      dialog.getByText("Save permissions?", { exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Yes", exact: true }).click();

    expect((await saveGraph).status()).toBe(200);

    await assertPermissionTable(page, finalExpectedRows);
  });
});

test.describe("scenarios > admin > permissions > view data > sandboxed", () => {
  test.skip(!resolveToken("pro-self-hosted"), TOKEN_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("allows editing sandboxed access in the database focused view", async ({
    page,
  }) => {
    await page.goto(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);

    // make sure that we have native permissions now so that we can validate that
    // permissions are dropped to query builder only after we sandbox a table
    await modifyPermission(
      page,
      "All Users",
      CREATE_QUERIES_PERM_IDX,
      "Query builder and native",
    );

    await selectSidebarItem(page, "Orders");

    await modifyPermission(
      page,
      "All Users",
      DATA_ACCESS_PERM_IDX,
      "Row and column security",
    );

    const changeDialog = modal(page);
    await expect(
      changeDialog.getByText(
        "Change access to this database to “Row and column security”?",
        { exact: true },
      ),
    ).toBeVisible();
    await changeDialog
      .getByRole("button", { name: "Change", exact: true })
      .click();

    await expect(page).toHaveURL(
      new RegExp(
        `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC/table/${ORDERS_ID}/segmented/group/${ALL_USERS_GROUP}`,
      ),
    );
    await expect(
      page.getByText("Configure row and column security for this table", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();

    await configureSandboxColumnAndAttribute(page);

    const expectedFinalPermissions = [
      [
        "Administrators",
        "Can view",
        "Query builder and native",
        "1 million rows",
        "Yes",
      ],
      // expect that the view data permissions has been automatically dropped to query builder only
      [
        "All Users",
        "Row and column security",
        "Query builder only",
        "1 million rows",
        "No",
      ],
      ["Data Analysts", "Blocked", "No", "No", "Yes"],
      ["collection", "Can view", "No", "1 million rows", "No"],
      ["data", "Can view", "Query builder and native", "1 million rows", "No"],
      ["nosql", "Can view", "Query builder only", "1 million rows", "No"],
      ["readonly", "Can view", "No", "1 million rows", "No"],
    ];
    await assertPermissionTable(page, expectedFinalPermissions);

    await modifyPermission(
      page,
      "All Users",
      DATA_ACCESS_PERM_IDX,
      "Edit row and column security",
    );

    await expect(page).toHaveURL(
      new RegExp(
        `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC/table/${ORDERS_ID}/segmented/group/${ALL_USERS_GROUP}`,
      ),
    );
    await expect(
      page.getByText("Configure row and column security for this table", {
        exact: true,
      }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByText("Configure row and column security for this table", {
        exact: true,
      }),
    ).toHaveCount(0);

    // Upstream does not confirm the save dialog here, and asserts the table
    // underneath it. Ported as written.
    await page.getByRole("button", { name: "Save changes", exact: true }).click();

    await assertPermissionTable(page, expectedFinalPermissions);
  });

  test("allows editing sandboxed access in the group focused view", async ({
    page,
  }) => {
    const saveGraph = waitForSaveGraph(page);
    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    // make sure that we have native permissions now so that we can validate that
    // permissions are droped to query builder only after we sandbox a table
    await modifyPermission(
      page,
      "Sample Database",
      CREATE_QUERIES_PERM_IDX,
      "Query builder and native",
    );

    await page
      .locator("a")
      .filter({ hasText: /Sample Database/ })
      .first()
      .click();

    await modifyPermission(
      page,
      "Orders",
      DATA_ACCESS_PERM_IDX,
      "Row and column security",
    );

    const changeDialog = modal(page);
    await expect(
      changeDialog.getByText(
        "Change access to this database to “Row and column security”?",
        { exact: true },
      ),
    ).toBeVisible();
    await changeDialog
      .getByRole("button", { name: "Change", exact: true })
      .click();

    await expect(page).toHaveURL(
      new RegExp(
        `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}/schema/PUBLIC/${ORDERS_ID}/segmented`,
      ),
    );
    await expect(
      modal(page).getByText(
        "Configure row and column security for this table",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      modal(page).getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();

    await configureSandboxColumnAndAttributeInModal(page);

    const expectedFinalPermissions = [
      ["Accounts", "Can view", "Query builder only", "1 million rows", "No"],
      [
        "Analytic Events",
        "Can view",
        "Query builder only",
        "1 million rows",
        "No",
      ],
      ["Feedback", "Can view", "Query builder only", "1 million rows", "No"],
      ["Invoices", "Can view", "Query builder only", "1 million rows", "No"],
      [
        "Orders",
        "Row and column security",
        "Query builder only",
        "1 million rows",
        "No",
      ],
      ["People", "Can view", "Query builder only", "1 million rows", "No"],
      ["Products", "Can view", "Query builder only", "1 million rows", "No"],
      ["Reviews", "Can view", "Query builder only", "1 million rows", "No"],
    ];

    await assertPermissionTable(page, expectedFinalPermissions);

    await modifyPermission(
      page,
      "Orders",
      DATA_ACCESS_PERM_IDX,
      "Edit row and column security",
    );

    await expect(page).toHaveURL(
      new RegExp(
        `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}/schema/PUBLIC/${ORDERS_ID}/segmented`,
      ),
    );

    await expect(
      modal(page).getByText(
        "Configure row and column security for this table",
        { exact: true },
      ),
    ).toBeVisible();

    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(modal(page)).toHaveCount(0);

    await expect(page).toHaveURL(
      new RegExp(
        `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}/schema/PUBLIC`,
      ),
    );

    await page.getByRole("button", { name: "Save changes", exact: true }).click();

    const saveDialog = modal(page);
    await expect(
      saveDialog.getByText("Save permissions?", { exact: true }),
    ).toBeVisible();
    await expect(
      saveDialog
        .getByText(
          /All Users will be given access to 1 table in Sample Database/,
        )
        .first(),
    ).toBeVisible();
    await saveDialog.getByRole("button", { name: "Yes", exact: true }).click();

    await saveGraph;

    // assertions that specifically targets metabase#37774. Should be able to reload with the schema in the URL and not error
    await expect(page).toHaveURL(
      new RegExp(
        `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}/schema/PUBLIC`,
      ),
    );
    await page.reload();

    await assertPermissionTable(page, expectedFinalPermissions);
  });
});

test.describe("scenarios > admin > permissions > view data > reproductions", () => {
  test("should allow you to sandbox view permissions and also edit the create queries permissions and saving should persist both (metabase#46450)", async ({
    page,
    mb,
  }) => {
    test.skip(!resolveToken("pro-self-hosted"), TOKEN_SKIP_REASON);

    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    const saveGraph = waitForSaveGraph(page);
    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    await page
      .locator("a")
      .filter({ hasText: /Sample Database/ })
      .first()
      .click();

    await modifyPermission(
      page,
      "Orders",
      DATA_ACCESS_PERM_IDX,
      "Row and column security",
    );

    await expect(
      modal(page).getByText(
        "Configure row and column security for this table",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      modal(page).getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();

    await configureSandboxColumnAndAttributeInModal(page);

    await modifyPermission(
      page,
      "Orders",
      CREATE_QUERIES_PERM_IDX,
      "Query builder only",
    );

    await savePermissions(page);

    expect((await saveGraph).status()).toBe(200);

    await assertPermissionForItem(
      page,
      "Orders",
      DATA_ACCESS_PERM_IDX,
      "Row and column security",
    );
    await assertPermissionForItem(
      page,
      "Orders",
      CREATE_QUERIES_PERM_IDX,
      "Query builder only",
    );
  });

  // Upstream tag: "@external" (QA Postgres12 + createTestRoles).
  test("should allow you to impersonate view permissions and also edit the create queries permissions and saving should persist both (metabase#46450)", async ({
    page,
    mb,
  }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);
    test.skip(!resolveToken("pro-self-hosted"), TOKEN_SKIP_REASON);

    await mb.restore("postgres-12");
    await createTestRoles();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    const saveGraph = waitForSaveGraph(page);

    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    // Set impersonated access on Postgres database
    await modifyPermission(
      page,
      "QA Postgres12",
      DATA_ACCESS_PERM_IDX,
      "Impersonated",
    );

    await selectImpersonatedAttribute(page, "role");
    await saveImpersonationSettings(page);

    await modifyPermission(
      page,
      "QA Postgres12",
      CREATE_QUERIES_PERM_IDX,
      "Query builder only",
    );

    await savePermissions(page);

    expect((await saveGraph).status()).toBe(200);

    await assertPermissionForItem(
      page,
      "QA Postgres12",
      DATA_ACCESS_PERM_IDX,
      "Impersonated",
    );
    await assertPermissionForItem(
      page,
      "QA Postgres12",
      CREATE_QUERIES_PERM_IDX,
      "Query builder only",
    );
  });
});

test.describe("scenarios > admin > permissions > view data > unrestricted", () => {
  test.skip(!resolveToken("pro-self-hosted"), TOKEN_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should allow perms to be set to from 'can view' to 'block' and back from database view", async ({
    page,
  }) => {
    await page.goto(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);

    await modifyPermission(page, "All Users", DATA_ACCESS_PERM_IDX, "Blocked");

    const firstSave = waitForSaveGraph(page);

    await page.getByRole("button", { name: "Save changes", exact: true }).click();

    const firstDialog = modal(page);
    await expect(
      firstDialog.getByText("Save permissions?", { exact: true }),
    ).toBeVisible();
    await firstDialog.getByRole("button", { name: "Yes", exact: true }).click();

    expect((await firstSave).status()).toBe(200);

    await modifyPermission(page, "All Users", DATA_ACCESS_PERM_IDX, "Can view");

    const secondSave = waitForSaveGraph(page);

    await page.getByRole("button", { name: "Save changes", exact: true }).click();

    const secondDialog = modal(page);
    await expect(
      secondDialog.getByText("Save permissions?", { exact: true }),
    ).toBeVisible();
    await secondDialog.getByRole("button", { name: "Yes", exact: true }).click();

    expect((await secondSave).status()).toBe(200);
  });
});

// ENFORMCENT RELATED TESTS

test.describe("scenarios > admin > permissions > view data > blocked (enforcement)", () => {
  test.skip(!resolveToken("pro-self-hosted"), TOKEN_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should deny view access to a query builder question that makes use of a blocked table", async ({
    page,
    mb,
  }) => {
    await assertCollectionGroupUserHasAccess(page, mb, ORDERS_QUESTION_ID, true);
    await page.goto(
      `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC/table/${ORDERS_ID}`,
    );
    await removeCollectionGroupPermissions(page);
    await assertCollectionGroupHasNoAccess(page, mb, ORDERS_QUESTION_ID, true);
  });

  test("should deny view access to a query builder question that makes use of a blocked database", async ({
    page,
    mb,
  }) => {
    await assertCollectionGroupUserHasAccess(page, mb, ORDERS_QUESTION_ID, true);
    await page.goto(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
    await removeCollectionGroupPermissions(page);
    await assertCollectionGroupHasNoAccess(page, mb, ORDERS_QUESTION_ID, true);
  });

  test("should deny view access to any native question if the user has blocked view data for any table or database", async ({
    page,
    mb,
  }) => {
    const { id: nativeQuestionId } = await createNativeQuestion(mb.api, {
      native: { query: "select 1" },
    });

    await assertCollectionGroupUserHasAccess(page, mb, nativeQuestionId, false);
    await page.goto(
      `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC/table/${ORDERS_ID}`,
    );
    await removeCollectionGroupPermissions(page);
    await assertCollectionGroupHasNoAccess(page, mb, nativeQuestionId, false);
  });
});

// NOTE: all helpers below make user of the "sandboxed" user and "collection" group to test permissions
// as this user is of only one group and has permission to view existing question
//
// `isQbQuestion` is part of the upstream signature and is never read by either
// function — kept so the call sites read identically.

/** Structural stand-in — MetabaseHarness isn't exported from fixtures
 * (same pattern as support/api-keys.ts). */
type SessionHarness = {
  signOut(): Promise<void>;
  signIn(user: "sandboxed"): Promise<void>;
  signInAsAdmin(): Promise<void>;
};

async function assertCollectionGroupUserHasAccess(
  page: Page,
  mb: SessionHarness,
  questionId: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isQbQuestion: boolean,
) {
  await mb.signOut();
  await mb.signIn("sandboxed");

  await visitQuestion(page, questionId);
  await lackPermissionsView(page, false);

  await mb.signOut();
  await mb.signInAsAdmin();
}

async function assertCollectionGroupHasNoAccess(
  page: Page,
  mb: SessionHarness,
  questionId: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isQbQuestion: boolean,
) {
  await mb.signOut();
  await mb.signIn("sandboxed");

  await visitQuestion(page, questionId);

  await lackPermissionsView(page, true);
}

async function removeCollectionGroupPermissions(page: Page) {
  // Upstream passes a 4th `false`/`true` argument to every call below;
  // H.assertPermissionForItem has no 4th parameter (see the spec header).
  await assertPermissionForItem(
    page,
    "All Users",
    DATA_ACCESS_PERM_IDX,
    "Can view",
  );
  await assertPermissionForItem(
    page,
    "collection",
    DATA_ACCESS_PERM_IDX,
    "Can view",
  );
  await modifyPermission(page, "All Users", DATA_ACCESS_PERM_IDX, "Blocked");
  await modifyPermission(page, "collection", DATA_ACCESS_PERM_IDX, "Blocked");
  await assertSameBeforeAndAfterSave(page, async () => {
    await assertPermissionForItem(
      page,
      "All Users",
      DATA_ACCESS_PERM_IDX,
      "Blocked",
    );
    await assertPermissionForItem(
      page,
      "collection",
      DATA_ACCESS_PERM_IDX,
      "Blocked",
    );
  });
}

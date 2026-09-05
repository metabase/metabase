/**
 * Playwright port of
 * e2e/test/scenarios/permissions/create-queries.cy.spec.js
 *
 * Notes:
 * - This spec exercises the create-queries data-permission levels
 *   (query-builder-and-native / query-builder / no / granular) entirely
 *   through the admin permissions UI, so the whole thing is UI-driven; nothing
 *   is set through the permission-graph API (every assertion is on the perms
 *   table itself).
 * - `modifyPermission` is reused read-only from support/command-palette.ts;
 *   `modal`/`popover` from support/ui.ts. The row/table/sidebar helpers live
 *   in support/create-queries.ts.
 * - `H.selectPermissionRow` + `popover().should("not.contain", …)` leaves the
 *   options popover open; an Escape closes it before navigating away (the
 *   sidebar click would otherwise land while the popover is still up).
 * - `cy.findByTextEnsureVisible("Sample Database").click()` (drill db → tables)
 *   is scoped to the permission table so it hits the row cell —
 *   drillIntoDatabaseRow.
 * - Two tests share the title "should allow setting create queries to 'query
 *   builder only' in group view"; the duplicate is preserved from upstream.
 */
import { modifyPermission } from "../support/command-palette";
import {
  ALL_USERS_GROUP,
  NATIVE_QUERIES_PERMISSION_INDEX,
  assertPermissionTable,
  drillIntoDatabaseRow,
  selectPermissionRow,
  selectSidebarItem,
} from "../support/create-queries";
import { test, expect } from "../support/fixtures";
import { modal, popover } from "../support/ui";
import type { Page } from "@playwright/test";

function saveButton(page: Page) {
  return page.getByRole("button", { name: "Save changes", exact: true });
}

async function confirmSavePermissions(page: Page) {
  const dialog = modal(page);
  await expect(
    dialog.getByText("Save permissions?", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(modal(page)).toHaveCount(0);
}

test.describe(
  "scenarios > admin > permissions > create queries > granular",
  () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
    });

    test("should allow configuring granular permissions in group view", async ({
      page,
    }) => {
      await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);
      await modifyPermission(
        page,
        "Sample Database",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "Query builder and native",
      );

      // should allow choosing granular option at the db level
      await modifyPermission(
        page,
        "Sample Database",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "Granular",
      );

      await assertPermissionTable(page, [
        ["Accounts", "Query builder and native"],
        ["Analytic Events", "Query builder and native"],
        ["Feedback", "Query builder and native"],
        ["Invoices", "Query builder and native"],
        ["Orders", "Query builder and native"],
        ["People", "Query builder and native"],
        ["Products", "Query builder and native"],
        ["Reviews", "Query builder and native"],
      ]);

      // should allow setting a granular value for one table
      await modifyPermission(
        page,
        "Orders",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "No",
      );

      const granularModal = modal(page);
      await expect(
        granularModal.getByText(
          "Change access to this database to “Granular”?",
          { exact: true },
        ),
      ).toBeVisible();
      await granularModal.getByText("Change", { exact: true }).click();

      // should also remove native permissions for all other tables
      await assertPermissionTable(page, [
        ["Accounts", "Query builder only"],
        ["Analytic Events", "Query builder only"],
        ["Feedback", "Query builder only"],
        ["Invoices", "Query builder only"],
        ["Orders", "No"],
        ["People", "Query builder only"],
        ["Products", "Query builder only"],
        ["Reviews", "Query builder only"],
      ]);

      // should not allow 'query builder and native' as a granular permissions option
      await selectPermissionRow(
        page,
        "Orders",
        NATIVE_QUERIES_PERMISSION_INDEX,
      );
      await expect(popover(page)).not.toContainText(
        "Query builder and native",
      );
      await page.keyboard.press("Escape");

      // should have db set to granular
      await selectSidebarItem(page, "All Users");
      await assertPermissionTable(page, [["Sample Database", "Granular"]]);

      // should allow saving
      const saveGraph = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname === "/api/permissions/graph",
      );
      await saveButton(page).click();
      const saveModal = modal(page);
      await expect(
        saveModal.getByText("Save permissions?", { exact: true }),
      ).toBeVisible();
      await saveModal.getByRole("button", { name: "Yes", exact: true }).click();
      const saveResponse = await saveGraph;
      expect(saveResponse.status()).toBe(200);

      // should infer value at db level if the tables are all made the same value
      await drillIntoDatabaseRow(page, "Sample Database");
      await modifyPermission(
        page,
        "Orders",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "Query builder only",
      );
      await selectSidebarItem(page, "All Users");
      await assertPermissionTable(page, [
        ["Sample Database", "Query builder only"],
      ]);
    });
  },
);

test.describe("scenarios > admin > permissions > create queries > no", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow setting create queries to 'no' in group view", async ({
    page,
  }) => {
    await page.goto("/admin/permissions/data");
    await selectSidebarItem(page, "data");

    await modifyPermission(
      page,
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "No",
    );

    await assertPermissionTable(page, [["Sample Database", "No"]]);

    await saveButton(page).click();
    await confirmSavePermissions(page);

    await assertPermissionTable(page, [["Sample Database", "No"]]);

    await drillIntoDatabaseRow(page, "Sample Database");

    await assertPermissionTable(page, [
      ["Accounts", "No"],
      ["Analytic Events", "No"],
      ["Feedback", "No"],
      ["Invoices", "No"],
      ["Orders", "No"],
      ["People", "No"],
      ["Products", "No"],
      ["Reviews", "No"],
    ]);
  });
});

test.describe(
  "scenarios > admin > permissions > create queries > query builder and native",
  () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
    });

    test("should allow setting create queries to 'query builder and native' in group view", async ({
      page,
    }) => {
      await page.goto("/admin/permissions");
      await selectSidebarItem(page, "collection");

      await assertPermissionTable(page, [["Sample Database", "No"]]);

      // Drill down to tables permissions
      await drillIntoDatabaseRow(page, "Sample Database");

      await assertPermissionTable(page, [
        ["Accounts", "No"],
        ["Analytic Events", "No"],
        ["Feedback", "No"],
        ["Invoices", "No"],
        ["Orders", "No"],
        ["People", "No"],
        ["Products", "No"],
        ["Reviews", "No"],
      ]);

      // Test that query builder and native is not an option when it's not selected at table level
      await selectPermissionRow(
        page,
        "Orders",
        NATIVE_QUERIES_PERMISSION_INDEX,
      );
      await expect(popover(page)).not.toContainText(
        "Query builder and native",
      );
      await page.keyboard.press("Escape");

      // Navigate back
      await selectSidebarItem(page, "collection");

      await modifyPermission(
        page,
        "Sample Database",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "Query builder and native",
      );

      await assertPermissionTable(page, [
        ["Sample Database", "Query builder and native"],
      ]);

      // Drill down to tables permissions
      await drillIntoDatabaseRow(page, "Sample Database");

      const finalTablePermissions = [
        ["Accounts", "Query builder and native"],
        ["Analytic Events", "Query builder and native"],
        ["Feedback", "Query builder and native"],
        ["Invoices", "Query builder and native"],
        ["Orders", "Query builder and native"],
        ["People", "Query builder and native"],
        ["Products", "Query builder and native"],
        ["Reviews", "Query builder and native"],
      ];

      await assertPermissionTable(page, finalTablePermissions);

      await saveButton(page).click();
      const saveModal = modal(page);
      await expect(
        saveModal.getByText("Save permissions?", { exact: true }),
      ).toBeVisible();
      await expect(
        saveModal.getByText(
          "collection will be able to use the query builder and write native queries for Sample Database.",
        ),
      ).toBeVisible();
      await saveModal
        .getByRole("button", { name: "Yes", exact: true })
        .click();

      await expect(
        page.getByText("Save changes", { exact: true }),
      ).toHaveCount(0);

      await assertPermissionTable(page, finalTablePermissions);

      // After saving permissions, user should be able to make further edits without refreshing the page
      // metabase#37811
      await selectSidebarItem(page, "data");

      await modifyPermission(
        page,
        "Sample Database",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "No",
      );

      await expect(
        page.getByRole("button", { name: "Refresh the page", exact: true }),
      ).toHaveCount(0);

      // User should have the option to change permissions back to query builder and native at the database level
      await modifyPermission(
        page,
        "Sample Database",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "Query builder and native",
      );
    });

    test("should allow setting create queries to 'query builder and native' in database view", async ({
      page,
    }) => {
      await page.goto("/admin/permissions/");
      await page.getByRole("tab", { name: "Databases", exact: true }).click();

      await expect(
        page.getByText("Select a database to see group permissions", {
          exact: true,
        }),
      ).toBeVisible();

      await selectSidebarItem(page, "Sample Database");

      await assertPermissionTable(page, [
        ["Administrators", "Query builder and native"],
        ["All Users", "No"],
        ["collection", "No"],
        ["data", "Query builder and native"],
        ["nosql", "Query builder only"],
        ["readonly", "No"],
      ]);

      await modifyPermission(
        page,
        "readonly",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "Query builder and native",
      );

      const finalPermissions = [
        ["Administrators", "Query builder and native"],
        ["All Users", "No"],
        ["collection", "No"],
        ["data", "Query builder and native"],
        ["nosql", "Query builder only"],
        ["readonly", "Query builder and native"],
      ];
      await assertPermissionTable(page, finalPermissions);

      await selectSidebarItem(page, "Orders");

      await assertPermissionTable(page, finalPermissions);

      // Navigate back
      await page
        .locator("a")
        .filter({ hasText: /Sample Database/ })
        .first()
        .click();

      await saveButton(page).click();
      const saveModal = modal(page);
      await expect(
        saveModal.getByText("Save permissions?", { exact: true }),
      ).toBeVisible();
      await expect(
        saveModal.getByText(
          "readonly will be able to use the query builder and write native queries for Sample Database.",
        ),
      ).toBeVisible();
      await saveModal
        .getByRole("button", { name: "Yes", exact: true })
        .click();

      await expect(
        page.getByText("Save changes", { exact: true }),
      ).toHaveCount(0);

      await assertPermissionTable(page, finalPermissions);
    });
  },
);

test.describe(
  "scenarios > admin > permissions > create queries > query builder only",
  () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
    });

    test("should allow setting create queries to 'query builder only' in group view", async ({
      page,
    }) => {
      await page.goto("/admin/permissions");
      await selectSidebarItem(page, "collection");

      await assertPermissionTable(page, [["Sample Database", "No"]]);

      // Drill down to tables permissions
      await drillIntoDatabaseRow(page, "Sample Database");

      await assertPermissionTable(page, [
        ["Accounts", "No"],
        ["Analytic Events", "No"],
        ["Feedback", "No"],
        ["Invoices", "No"],
        ["Orders", "No"],
        ["People", "No"],
        ["Products", "No"],
        ["Reviews", "No"],
      ]);

      // Navigate back
      await selectSidebarItem(page, "collection");

      await modifyPermission(
        page,
        "Sample Database",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "Query builder only",
      );

      await assertPermissionTable(page, [
        ["Sample Database", "Query builder only"],
      ]);

      // Drill down to tables permissions
      await drillIntoDatabaseRow(page, "Sample Database");

      const finalTablePermissions = [
        ["Accounts", "Query builder only"],
        ["Analytic Events", "Query builder only"],
        ["Feedback", "Query builder only"],
        ["Invoices", "Query builder only"],
        ["Orders", "Query builder only"],
        ["People", "Query builder only"],
        ["Products", "Query builder only"],
        ["Reviews", "Query builder only"],
      ];

      await assertPermissionTable(page, finalTablePermissions);

      await saveButton(page).click();
      const saveModal = modal(page);
      await expect(
        saveModal.getByText("Save permissions?", { exact: true }),
      ).toBeVisible();
      await expect(
        saveModal.getByText(
          "collection will only be able to use the query builder for Sample Database.",
        ),
      ).toBeVisible();
      await saveModal
        .getByRole("button", { name: "Yes", exact: true })
        .click();

      await expect(
        page.getByText("Save changes", { exact: true }),
      ).toHaveCount(0);

      await assertPermissionTable(page, finalTablePermissions);

      // After saving permissions, user should be able to make further edits without refreshing the page
      // metabase#37811
      await selectSidebarItem(page, "data");

      await modifyPermission(
        page,
        "Sample Database",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "No",
      );

      await expect(
        page.getByRole("button", { name: "Refresh the page", exact: true }),
      ).toHaveCount(0);

      // User should have the option to change permissions back to query builder only at the database level
      await modifyPermission(
        page,
        "Sample Database",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "Query builder only",
      );
    });

    test("should set entire database to 'query builder only' if a table is changed to it while db is 'query builder only'", async ({
      page,
    }) => {
      await page.goto("/admin/permissions");
      await selectSidebarItem(page, "collection");

      await assertPermissionTable(page, [["Sample Database", "No"]]);

      await modifyPermission(
        page,
        "Sample Database",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "Query builder and native",
      );

      // Drill down to tables permissions
      await drillIntoDatabaseRow(page, "Sample Database");

      await assertPermissionTable(page, [
        ["Accounts", "Query builder and native"],
        ["Analytic Events", "Query builder and native"],
        ["Feedback", "Query builder and native"],
        ["Invoices", "Query builder and native"],
        ["Orders", "Query builder and native"],
        ["People", "Query builder and native"],
        ["Products", "Query builder and native"],
        ["Reviews", "Query builder and native"],
      ]);

      await modifyPermission(
        page,
        "Orders",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "Query builder only",
      );

      const granularModal = modal(page);
      await expect(
        granularModal.getByText(
          "Change access to this database to “Granular”?",
          { exact: true },
        ),
      ).toBeVisible();
      await granularModal.getByText("Change", { exact: true }).click();

      const finalTablePermissions = [
        ["Accounts", "Query builder only"],
        ["Analytic Events", "Query builder only"],
        ["Feedback", "Query builder only"],
        ["Invoices", "Query builder only"],
        ["Orders", "Query builder only"],
        ["People", "Query builder only"],
        ["Products", "Query builder only"],
        ["Reviews", "Query builder only"],
      ];

      await assertPermissionTable(page, finalTablePermissions);

      // Navigate back
      await selectSidebarItem(page, "collection");
      await assertPermissionTable(page, [
        ["Sample Database", "Query builder only"],
      ]);

      await saveButton(page).click();
      const saveModal = modal(page);
      await expect(
        saveModal.getByText("Save permissions?", { exact: true }),
      ).toBeVisible();
      await expect(
        saveModal.getByText(
          "collection will only be able to use the query builder for Sample Database.",
        ),
      ).toBeVisible();
      await saveModal
        .getByRole("button", { name: "Yes", exact: true })
        .click();

      await expect(
        page.getByText("Save changes", { exact: true }),
      ).toHaveCount(0);

      // Drill down to tables permissions
      await drillIntoDatabaseRow(page, "Sample Database");

      await assertPermissionTable(page, finalTablePermissions);
    });

    // Upstream declares this title twice in the same describe; Playwright forbids
    // duplicate titles, so the second copy carries a "(2)" suffix. Body is a
    // faithful port of the second upstream `it`.
    test("should allow setting create queries to 'query builder only' in group view (2)", async ({
      page,
    }) => {
      await page.goto("/admin/permissions");
      await selectSidebarItem(page, "collection");

      await assertPermissionTable(page, [["Sample Database", "No"]]);

      // Drill down to tables permissions
      await drillIntoDatabaseRow(page, "Sample Database");

      await assertPermissionTable(page, [
        ["Accounts", "No"],
        ["Analytic Events", "No"],
        ["Feedback", "No"],
        ["Invoices", "No"],
        ["Orders", "No"],
        ["People", "No"],
        ["Products", "No"],
        ["Reviews", "No"],
      ]);

      // Navigate back
      await selectSidebarItem(page, "collection");

      await modifyPermission(
        page,
        "Sample Database",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "Query builder only",
      );

      await assertPermissionTable(page, [
        ["Sample Database", "Query builder only"],
      ]);

      // Drill down to tables permissions
      await drillIntoDatabaseRow(page, "Sample Database");

      const finalTablePermissions = [
        ["Accounts", "Query builder only"],
        ["Analytic Events", "Query builder only"],
        ["Feedback", "Query builder only"],
        ["Invoices", "Query builder only"],
        ["Orders", "Query builder only"],
        ["People", "Query builder only"],
        ["Products", "Query builder only"],
        ["Reviews", "Query builder only"],
      ];

      await assertPermissionTable(page, finalTablePermissions);

      await saveButton(page).click();
      const saveModal = modal(page);
      await expect(
        saveModal.getByText("Save permissions?", { exact: true }),
      ).toBeVisible();
      await expect(
        saveModal.getByText(
          "collection will only be able to use the query builder for Sample Database.",
        ),
      ).toBeVisible();
      await saveModal
        .getByRole("button", { name: "Yes", exact: true })
        .click();

      await expect(
        page.getByText("Save changes", { exact: true }),
      ).toHaveCount(0);

      await assertPermissionTable(page, finalTablePermissions);

      // After saving permissions, user should be able to make further edits without refreshing the page
      // metabase#37811
      await selectSidebarItem(page, "data");

      await modifyPermission(
        page,
        "Sample Database",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "No",
      );

      await expect(
        page.getByRole("button", { name: "Refresh the page", exact: true }),
      ).toHaveCount(0);

      // User should have the option to change permissions back to query builder only at the database level
      await modifyPermission(
        page,
        "Sample Database",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "Query builder only",
      );
    });

    test("should allow setting create queries to 'query builder only' in database view", async ({
      page,
    }) => {
      await page.goto("/admin/permissions/");
      await page.getByRole("tab", { name: "Databases", exact: true }).click();

      await expect(
        page.getByText("Select a database to see group permissions", {
          exact: true,
        }),
      ).toBeVisible();

      await selectSidebarItem(page, "Sample Database");

      await assertPermissionTable(page, [
        ["Administrators", "Query builder and native"],
        ["All Users", "No"],
        ["collection", "No"],
        ["data", "Query builder and native"],
        ["nosql", "Query builder only"],
        ["readonly", "No"],
      ]);

      await modifyPermission(
        page,
        "readonly",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "Query builder only",
      );

      const finalPermissions = [
        ["Administrators", "Query builder and native"],
        ["All Users", "No"],
        ["collection", "No"],
        ["data", "Query builder and native"],
        ["nosql", "Query builder only"],
        ["readonly", "Query builder only"],
      ];
      await assertPermissionTable(page, finalPermissions);

      await selectSidebarItem(page, "Orders");

      await assertPermissionTable(page, finalPermissions);

      // Navigate back
      await page
        .locator("a")
        .filter({ hasText: /Sample Database/ })
        .first()
        .click();

      await saveButton(page).click();
      const saveModal = modal(page);
      await expect(
        saveModal.getByText("Save permissions?", { exact: true }),
      ).toBeVisible();
      await expect(
        saveModal.getByText(
          "readonly will only be able to use the query builder for Sample Database.",
        ),
      ).toBeVisible();
      await saveModal
        .getByRole("button", { name: "Yes", exact: true })
        .click();

      await expect(
        page.getByText("Save changes", { exact: true }),
      ).toHaveCount(0);

      await assertPermissionTable(page, finalPermissions);
    });
  },
);

/**
 * Playwright port of
 * e2e/test/scenarios/permissions/admin-permissions.cy.spec.js
 *
 * Structure mirrors the four upstream describe blocks:
 *  1. The `@OSS`-tagged block (data + collection permission tables, group/db
 *     granularity, save/confirm, discard-changes modals, stale-revision modal).
 *     Upstream tags it `@OSS`, so CI's EE leg *excludes* it (grepTags has
 *     `-@OSS`) and it runs only against the OSS jar. The spike backend is EE,
 *     so — following admin-authentication / embedding-smoketests — the whole
 *     block is gated with `isOssBackend` and SKIPS on our EE jar. Ported
 *     faithfully so it runs when pointed at an OSS build; runtime-unverified
 *     here (green == correctly skipped).
 *  2. The EE / `pro-self-hosted` block (blocked data sources).
 *  3. Permissions help reference + the split-permission upgrade modal/banner.
 *  4. Partial data / collection permission-graph updates.
 *
 * Port notes:
 * - Shared read-only helpers: `assertPermissionTable`, `selectSidebarItem`,
 *   `selectPermissionRow`, `drillIntoDatabaseRow`, `permissionTable`,
 *   `ALL_USERS_GROUP`, `NATIVE_QUERIES_PERMISSION_INDEX` from create-queries.ts;
 *   `modal`/`popover`/`icon`/`main`/`goToTab`/`visitQuestion`/`visitDashboard`
 *   from ui.ts; `updatePermissionsGraph` from dashboard-repros.ts;
 *   `queryBuilderMain` from notebook.ts; `queryBuilderFooter` from
 *   filter-bulk.ts; `visitDataModel` from data-model.ts. The
 *   full-signature `modifyPermission`, `assertSidebarItems`,
 *   `assertPermissionOptions`, `mockSessionPropertiesMerging` and the group-id
 *   constants live in the new support/admin-permissions.ts.
 * - Stale-revision test: upstream reads the revision from the intercepted
 *   `/api/permissions/graph/group/1` response. The revision is global, so a
 *   fresh `GET /api/permissions/graph` (before the staged edit is saved) yields
 *   the same value — used to PUT an empty-groups change that bumps the revision
 *   out from under the FE.
 * - `should("not.contain", /regex/)` upstream is vacuous (chai `contain`
 *   stringifies the regex, so it never matches) — ported as the intended
 *   `not.toContainText("No self-service")`.
 * - Retried URL assertions → `expect.poll` (PORTING gotcha).
 */
import {
  ADMIN_GROUP,
  COLLECTION_GROUP,
  DATA_GROUP,
  assertPermissionOptions,
  assertSidebarItems,
  mockSessionPropertiesMerging,
  modifyPermission,
} from "../support/admin-permissions";
import { isOssBackend } from "../support/admin";
import {
  ALL_USERS_GROUP,
  NATIVE_QUERIES_PERMISSION_INDEX,
  assertPermissionTable,
  drillIntoDatabaseRow,
  permissionTable,
  selectPermissionRow,
  selectSidebarItem,
} from "../support/create-queries";
import { visitDataModel } from "../support/data-model";
import { updatePermissionsGraph } from "../support/dashboard-repros";
import { queryBuilderFooter } from "../support/filter-bulk";
import { test, expect } from "../support/fixtures";
import { queryBuilderMain } from "../support/notebook";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import {
  goToTab,
  icon,
  main,
  modal,
  visitDashboard,
  visitQuestion,
} from "../support/ui";
import type { Page } from "@playwright/test";

const COLLECTION_ACCESS_PERMISSION_INDEX = 0;

function saveButton(page: Page) {
  return page
    .getByTestId("edit-bar")
    .getByRole("button", { name: "Save changes", exact: true });
}

/** Click Save changes, confirm the "Save permissions?" modal, and wait for the
 * PUT that carries the change (path-matched by `pathname`). */
async function saveAndConfirm(page: Page, pathname: string) {
  await saveButton(page).click();
  const update = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === pathname,
  );
  await modal(page).getByRole("button", { name: "Yes", exact: true }).click();
  return update;
}

test.describe("scenarios > admin > permissions (@OSS)", () => {
  // Upstream describe is tagged @OSS: excluded from CI's EE leg, run only
  // against the OSS jar. Skip on EE backends (the spike default).
  test.beforeEach(async ({ mb }) => {
    test.skip(
      !(await isOssBackend(mb.api)),
      "@OSS-tagged upstream: needs an OSS backend",
    );
  });

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("shows hidden tables", async ({ page }) => {
    await visitDataModel(page, "admin", { databaseId: SAMPLE_DB_ID });
    await icon(page, "eye_crossed_out").first().click();

    await page.goto(
      `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}`,
    );

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

  test("should not show view data column on OSS", async ({ page }) => {
    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    const table = permissionTable(page);
    await expect(table.getByText("Database name", { exact: true })).toBeVisible();
    await expect(table.getByText("View data", { exact: true })).toHaveCount(0);
    await expect(
      table.getByText("Create queries", { exact: true }),
    ).toBeVisible();
  });

  test("should display error on failed save", async ({ page }) => {
    // revoke some permissions
    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);
    await icon(page, "close").first().click();
    await page
      .getByRole("option")
      .filter({ hasText: "Query builder and native" })
      .first()
      .click();

    // stub out the PUT and save
    await page.route(
      (url) => url.pathname === "/api/permissions/graph",
      async (route) => {
        if (route.request().method() !== "PUT") {
          return route.continue();
        }
        await route.fulfill({ status: 500, body: "Server error" });
      },
    );

    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await page.getByRole("button", { name: "Yes", exact: true }).click();

    // see error modal
    await expect(page.getByText(/Server error/).first()).toBeVisible();
    await expect(
      page.getByText(/There was an error saving/).first(),
    ).toBeVisible();
  });

  test.describe("collection permissions", () => {
    test("warns about leaving with unsaved changes", async ({ page }) => {
      await page.goto("/admin/permissions/collections");

      await selectSidebarItem(page, "First collection");

      await modifyPermission(
        page,
        "All Users",
        COLLECTION_ACCESS_PERMISSION_INDEX,
        "View",
        true,
      );

      // Navigation to other collection should not show any warnings
      await selectSidebarItem(page, "Our analytics");

      await expect(modal(page)).toHaveCount(0);

      // Switching to data permissions page
      await goToTab(page, "Data");

      const discardModal = modal(page);
      await expect(
        discardModal.getByText("Discard your changes?", { exact: true }),
      ).toBeVisible();
      await expect(
        discardModal.getByText(
          "Your changes haven't been saved, so you'll lose them if you navigate away.",
          { exact: true },
        ),
      ).toBeVisible();
      await discardModal
        .getByRole("button", { name: "Cancel", exact: true })
        .click();

      await expect
        .poll(() => page.url())
        .toContain("/admin/permissions/collections/root");

      // Switching to data permissions page again
      await goToTab(page, "Data");

      await modal(page)
        .getByRole("button", { name: "Discard changes", exact: true })
        .click();

      await expect
        .poll(() => page.url())
        .toContain("/admin/permissions/data/group");
    });

    test("allows to view and edit permissions", async ({ page }) => {
      await page.goto("/admin/permissions/collections");

      const collections = ["Our analytics", "First collection"];
      await assertSidebarItems(page, collections);

      await selectSidebarItem(page, "First collection");
      await assertSidebarItems(page, [...collections, "Second collection"]);

      await selectSidebarItem(page, "Second collection");

      await assertPermissionTable(page, [
        ["Administrators", "Curate"],
        ["All Users", "No access"],
        ["collection", "Curate"],
        ["data", "No access"],
        ["nosql", "No access"],
        ["readonly", "View"],
      ]);

      await modifyPermission(
        page,
        "All Users",
        COLLECTION_ACCESS_PERMISSION_INDEX,
        "View",
        true,
      );

      // Navigate to children
      await selectSidebarItem(page, "Third collection");

      await assertPermissionTable(page, [
        ["Administrators", "Curate"],
        ["All Users", "View"], // Check permission has been propagated
        ["collection", "Curate"],
        ["data", "No access"],
        ["nosql", "No access"],
        ["readonly", "View"],
      ]);

      // Navigate to parent
      await selectSidebarItem(page, "First collection");

      await assertPermissionTable(page, [
        ["Administrators", "Curate"],
        ["All Users", "No access"],
        ["collection", "Curate"],
        ["data", "No access"],
        ["nosql", "No access"],
        ["readonly", "View"],
      ]);

      await modifyPermission(
        page,
        "All Users",
        COLLECTION_ACCESS_PERMISSION_INDEX,
        "Curate",
        false,
      );

      await selectSidebarItem(page, "Second collection");

      await assertPermissionTable(page, [
        ["Administrators", "Curate"],
        ["All Users", "View"], // Check permission has not been propagated
        ["collection", "Curate"],
        ["data", "No access"],
        ["nosql", "No access"],
        ["readonly", "View"],
      ]);

      const update = await saveAndConfirm(page, "/api/collection/graph");
      await update;

      await expect(
        page.getByRole("button", { name: "Save changes", exact: true }),
      ).toHaveCount(0);

      await assertPermissionTable(page, [
        ["Administrators", "Curate"],
        ["All Users", "View"],
        ["collection", "Curate"],
        ["data", "No access"],
        ["nosql", "No access"],
        ["readonly", "View"],
      ]);
    });
  });

  test("don't propagate permissions after turning off 'Also change sub-collections' toggle (#30494)", async ({
    page,
  }) => {
    await page.goto("/admin/permissions/collections");

    const collections = ["Our analytics", "First collection"];
    await assertSidebarItems(page, collections);

    await selectSidebarItem(page, "First collection");
    await assertSidebarItems(page, [...collections, "Second collection"]);

    await selectSidebarItem(page, "Second collection");

    await assertPermissionTable(page, [
      ["Administrators", "Curate"],
      ["All Users", "No access"],
      ["collection", "Curate"],
      ["data", "No access"],
      ["nosql", "No access"],
      ["readonly", "View"],
    ]);

    await modifyPermission(
      page,
      "All Users",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      "View",
      true, // Turn 'Also change sub-collections' toggle on
    );

    await modifyPermission(
      page,
      "All Users",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      null,
      false, // Turn 'Also change sub-collections' toggle off
    );

    // Navigate to children
    await selectSidebarItem(page, "Third collection");

    await assertPermissionTable(page, [
      ["Administrators", "Curate"],
      ["All Users", "No access"], // Check permission hasn't been propagated
      ["collection", "Curate"],
      ["data", "No access"],
      ["nosql", "No access"],
      ["readonly", "View"],
    ]);
  });

  test("show selected option for the collection with children", async ({
    page,
  }) => {
    await page.goto("/admin/permissions/collections");

    const collections = ["Our analytics", "First collection"];
    await assertSidebarItems(page, collections);

    await selectSidebarItem(page, "First collection");
    await assertSidebarItems(page, [...collections, "Second collection"]);

    await selectSidebarItem(page, "Second collection");
    await selectPermissionRow(
      page,
      "All Users",
      COLLECTION_ACCESS_PERMISSION_INDEX,
    );
    await assertPermissionOptions(page, ["Curate", "View", "No access"]);

    await selectSidebarItem(page, "Third collection");
    await selectPermissionRow(
      page,
      "All Users",
      COLLECTION_ACCESS_PERMISSION_INDEX,
    );

    await assertPermissionOptions(page, ["Curate", "View"]);
  });

  test.describe("data permissions", () => {
    test("warns about leaving with unsaved changes", async ({ page }) => {
      await page.goto("/admin/permissions");

      await selectSidebarItem(page, "All Users");

      await modifyPermission(
        page,
        "Sample Database",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "Query builder and native",
      );

      await expect(
        page.getByText("You've made changes to permissions.", { exact: true }),
      ).toBeVisible();

      // Switching to databases focus should not show any warnings
      await goToTab(page, "Databases");

      await expect
        .poll(() => page.url())
        .toContain("/admin/permissions/data/database");
      await expect(modal(page)).toHaveCount(0);

      // Switching to collection permissions page
      await goToTab(page, "Collections");

      const discardModal = modal(page);
      await expect(
        discardModal.getByText("Discard your changes?", { exact: true }),
      ).toBeVisible();
      await expect(
        discardModal.getByText(
          "Your changes haven't been saved, so you'll lose them if you navigate away.",
          { exact: true },
        ),
      ).toBeVisible();
      await discardModal
        .getByRole("button", { name: "Cancel", exact: true })
        .click();

      await expect
        .poll(() => page.url())
        .toContain("/admin/permissions/data/database");

      // Switching to collection permissions page again
      await goToTab(page, "Collections");

      await modal(page)
        .getByRole("button", { name: "Discard changes", exact: true })
        .click();

      await expect
        .poll(() => page.url())
        .toContain("/admin/permissions/collections");
    });

    test.describe("group focused view", () => {
      test("shows filterable list of groups", async ({ page }) => {
        await page.goto("/admin/permissions");

        // no groups selected initially and it shows an empty state
        await expect(
          page.getByText("Select a group to see its data permissions", {
            exact: true,
          }),
        ).toBeVisible();

        const groups = [
          "Administrators",
          "All Users",
          "collection",
          "data",
          "nosql",
          "readonly",
        ];

        await assertSidebarItems(page, groups);

        // filter groups
        await page
          .getByPlaceholder("Search for a group")
          .pressSequentially("a");

        const filteredGroups = [
          "Administrators",
          "All Users",
          "data",
          "readonly",
        ];

        await expect(page.getByRole("menuitem")).toHaveCount(
          filteredGroups.length,
        );
        await assertSidebarItems(page, filteredGroups);
      });

      test("allows to only view Administrators permissions", async ({
        page,
      }) => {
        await page.goto("/admin/permissions");

        await selectSidebarItem(page, "Administrators");

        await expect
          .poll(() => page.url())
          .toContain(`/admin/permissions/data/group/${ADMIN_GROUP}`);

        await expect(
          page.getByText("Permissions for the Administrators group", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(page.getByText("1 person", { exact: true })).toBeVisible();

        await assertPermissionTable(page, [
          ["Sample Database", "Query builder and native"],
        ]);

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
      });

      test("should show a modal when a revision changes while an admin is editing", async ({
        page,
        mb,
      }) => {
        await page.goto("/admin/permissions");

        await selectSidebarItem(page, "collection");

        await modifyPermission(
          page,
          "Sample Database",
          NATIVE_QUERIES_PERMISSION_INDEX,
          "Query builder and native",
        );

        // Bump the graph revision out from under the FE (upstream reads the
        // revision from the intercepted group/1 graph; a fresh GET yields the
        // same global revision since the staged edit hasn't been saved).
        const graph = (await (
          await mb.api.get("/api/permissions/graph")
        ).json()) as { revision: number };
        await mb.api.put("/api/permissions/graph", {
          groups: {},
          revision: graph.revision,
        });

        await selectSidebarItem(page, "data");

        await expect(
          modal(page).getByText("Someone just changed permissions", {
            exact: true,
          }),
        ).toBeVisible();
      });
    });

    test.describe("database focused view", () => {
      test("should show a modal when a revision changes while an admin is editing", async ({
        page,
        mb,
      }) => {
        await page.goto("/admin/permissions/");

        await selectSidebarItem(page, "collection");

        await modifyPermission(
          page,
          "Sample Database",
          NATIVE_QUERIES_PERMISSION_INDEX,
          "Query builder and native",
        );

        const graph = (await (
          await mb.api.get("/api/permissions/graph")
        ).json()) as { revision: number };
        await mb.api.put("/api/permissions/graph", {
          groups: {},
          revision: graph.revision,
        });

        await goToTab(page, "Databases");
        await selectSidebarItem(page, "Sample Database");

        await expect(
          modal(page).getByText("Someone just changed permissions", {
            exact: true,
          }),
        ).toBeVisible();
      });
    });
  });
});

test.describe("scenarios > admin > permissions (EE)", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("Visualization and Settings query builder buttons are not visible for questions that use blocked data sources", async ({
    page,
    mb,
  }) => {
    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "blocked",
        },
      },
      [COLLECTION_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "blocked",
        },
      },
    });

    await mb.signIn("nodata");
    await visitQuestion(page, ORDERS_QUESTION_ID);

    await expect(
      queryBuilderMain(page).getByText(
        "Sorry, you don't have permission to run this query.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      queryBuilderFooter(page).getByTestId("viz-settings-button"),
    ).toHaveCount(0);
    await expect(
      queryBuilderFooter(page).getByText("Visualization", { exact: true }),
    ).toHaveCount(0);
  });

  test("shows permission error for cards that use blocked data sources", async ({
    page,
    mb,
  }) => {
    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "blocked",
        },
      },
      [COLLECTION_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "blocked",
        },
      },
    });

    await mb.signIn("nodata");
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await expect(
      page
        .getByText("Sorry, you don't have permission to see this card.", {
          exact: true,
        })
        .first(),
    ).toBeVisible();
  });
});

test.describe("scenarios > admin > permissions (help + split-perms)", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("shows permissions help", async ({ page, mb }) => {
    // pro-token because some help sections are hidden for OSS
    await mb.api.activateToken("pro-self-hosted");
    await page.goto("/admin/permissions");

    await main(page).getByText("Permissions help", { exact: true }).click();
    await expect(
      main(page).getByText("Permissions help", { exact: true }),
    ).toHaveCount(0);

    const helpRef = page.getByLabel("Permissions help reference", {
      exact: true,
    });
    await expect(
      helpRef.getByText("Data permissions", { exact: true }),
    ).toBeVisible();

    await helpRef.getByText("Database ‘View data’ levels", { exact: true }).click();
    await expect(page.getByTestId("database-view-data-level")).not.toContainText(
      "No self-service",
    );
    await helpRef.getByText("Database ‘View data’ levels", { exact: true }).click();

    await helpRef.getByText(/Schema or table ‘View data’ levels/).click();
    await expect(page.getByTestId("schema-table-level")).not.toContainText(
      "No self-service",
    );
    await helpRef.getByText(/Schema or table ‘View data’ levels/).click();

    await expect(
      helpRef.getByText("‘Create queries’ levels", { exact: true }),
    ).toBeVisible();

    await helpRef.getByLabel("Close", { exact: true }).click();

    // Data permissions w/ `legacy-no-self-service` in graph
    await page.goto("/admin/permissions");

    await page.route(
      (url) =>
        url.pathname === `/api/permissions/graph/group/${ALL_USERS_GROUP}`,
      async (route) => {
        if (route.request().method() !== "GET") {
          return route.continue();
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
                  "create-queries": "query-builder-and-native",
                  download: { schemas: "full" },
                },
              },
            },
          }),
        });
      },
    );

    await main(page).getByText("Permissions help", { exact: true }).click();
    await expect(
      main(page).getByText("Permissions help", { exact: true }),
    ).toHaveCount(0);

    await helpRef
      .getByText("Database ‘View data’ levels", { exact: true })
      .click();
    await expect(helpRef.getByText(/No self-service/).first()).toBeVisible();
    await helpRef.getByLabel("Close", { exact: true }).click();

    await goToTab(page, "Collections");
    await main(page).getByText("Permissions help", { exact: true }).click();

    // Collection permissions
    await expect(
      helpRef.getByText("Collection permissions", { exact: true }),
    ).toBeVisible();
    await expect(
      helpRef.getByText("Collections Permission Levels", { exact: true }),
    ).toBeVisible();

    // The help reference keeps being open when switching tabs
    await goToTab(page, "Data");

    await expect(
      helpRef.getByText("Data permissions", { exact: true }),
    ).toBeVisible();
  });

  test("should show a dismissable modal and banner showing split permission changes (#metabase#45073", async ({
    page,
  }) => {
    // In CI these settings are always false on a fresh instance; force them
    // true to exercise the 49 -> current upgrade flow. The setting-write
    // intercepts flip local state so a session refresh reflects the toggle-off.
    const tempState: Record<string, unknown> = {
      "show-updated-permission-modal": true,
      "show-updated-permission-banner": true,
    };

    await mockSessionPropertiesMerging(page, () => tempState);

    await page.route(
      (url) => url.pathname === "/api/setting/show-updated-permission-modal",
      async (route) => {
        tempState["show-updated-permission-modal"] = false;
        await route.continue();
      },
    );
    await page.route(
      (url) => url.pathname === "/api/setting/show-updated-permission-banner",
      async (route) => {
        tempState["show-updated-permission-banner"] = false;
        await route.continue();
      },
    );

    const isSessionProps = (response: {
      url: () => string;
    }) => new URL(response.url()).pathname === "/api/session/properties";

    const props1 = page.waitForResponse(isSessionProps);
    await page.goto("/admin/permissions/");
    await props1;

    const props2 = page.waitForResponse(isSessionProps);
    await page
      .getByRole("dialog", { name: /permissions may look different/ })
      .getByRole("button", { name: "Got it", exact: true })
      .click();
    await props2;

    await page.getByRole("menuitem", { name: "All Users" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Your data permissions may look different",
    );

    const props3 = page.waitForResponse(isSessionProps);
    await page.getByRole("alert").getByRole("button").click();
    await props3;

    await page.reload();

    await expect(
      page.getByRole("dialog", { name: /permissions may look different/ }),
    ).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("split permission change modal should dismiss even if network request fails", async ({
    page,
  }) => {
    const tempState: Record<string, unknown> = {
      "show-updated-permission-modal": true,
    };

    await mockSessionPropertiesMerging(page, () => tempState);

    await page.route(
      (url) => url.pathname === "/api/setting/show-updated-permission-modal",
      async (route) => {
        await route.fulfill({ status: 500 });
      },
    );

    const isSessionProps = (response: {
      url: () => string;
    }) => new URL(response.url()).pathname === "/api/session/properties";

    const props1 = page.waitForResponse(isSessionProps);
    await page.goto("/admin/permissions/");
    await props1;

    const props2 = page.waitForResponse(isSessionProps);
    await page
      .getByRole("dialog", { name: /permissions may look different/ })
      .getByRole("button", { name: "Got it", exact: true })
      .click();
    await props2;

    await page.getByRole("menuitem", { name: "All Users" }).click();
  });
});

test.describe("scenarios > admin > permissions (partial updates)", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("partial data permission updates should not remove permissions from other unmodified groups", async ({
    page,
  }) => {
    // check the we have an expected initial state
    await page.goto(`/admin/permissions/data/group/${DATA_GROUP}`);
    await assertPermissionTable(page, [
      ["Sample Database", "Query builder and native"],
    ]);

    // make a change to the permissions of another group
    await selectSidebarItem(page, "nosql");
    await assertPermissionTable(page, [
      ["Sample Database", "Query builder only"],
    ]);
    await modifyPermission(
      page,
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "No",
    );

    // observe the save change request and assert that we don't get back
    // values for groups we did not modify
    const update = await saveAndConfirm(page, "/api/permissions/graph");
    const interception = await update;

    const requestGroupIds = Object.keys(
      interception.request().postDataJSON().groups,
    );
    const responseGroupIds = Object.keys((await interception.json()).groups);
    expect(requestGroupIds).toEqual(responseGroupIds);

    // make sure that our other group's permission data did not get changed
    await selectSidebarItem(page, "data");
    await assertPermissionTable(page, [
      ["Sample Database", "Query builder and native"],
    ]);
  });

  test("partial collection permission updates should not prevent user from making further changes", async ({
    page,
  }) => {
    await page.goto("/admin/permissions/collections");

    await selectSidebarItem(page, "First collection");

    await modifyPermission(
      page,
      "All Users",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      "View",
      false,
    );

    const update1 = await saveAndConfirm(page, "/api/collection/graph");
    const interception1 = await update1;

    // should skip graph in request and response
    expect(await interception1.json()).not.toHaveProperty("groups");

    await selectSidebarItem(page, "First collection");

    await modifyPermission(
      page,
      "nosql",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      "Curate",
      false,
    );

    const update2 = await saveAndConfirm(page, "/api/collection/graph");
    const interception2 = await update2;

    // should not send previously saved edits
    expect(interception2.request().postDataJSON().groups).not.toHaveProperty(
      String(ALL_USERS_GROUP),
    );

    // should not fail when making multiple rounds of edits
    expect(interception2.status()).toBe(200);
  });
});

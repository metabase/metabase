/**
 * Playwright port of
 * e2e/test/scenarios/admin/database-routing/database-routing-admin.cy.spec.ts
 *
 * Admin database routing (mirror-DB config): enable routing on a database, pick
 * the routed-on user attribute, manage the destination-databases table
 * (create/validate/edit/remove), the routing toggle + its disabled-state
 * tooltip, feature visibility per db type / per permission, and mutual
 * exclusivity with model actions / model persistence / table editing / uploads.
 *
 * Infra-gated (PORTING infra-gate rule): the whole upstream spec restores the
 * `postgres-writable` snapshot and drives WRITABLE_DB_ID (the writable QA
 * postgres) — destination "mirror" databases are real postgres connections on
 * QA_POSTGRES_PORT (5404), and creation POSTs with `check_connection_details`.
 * Neither the snapshot nor the QA postgres is provisioned in the spike, so the
 * spec is gated on PW_QA_DB_ENABLED and SKIPS on the jar. Faithful-by-
 * construction; a green run there means "correctly skipped", not "passing".
 * The EE describe is additionally token-gated (pro-self-hosted); the OSS test
 * is gated on an OSS build (this spike backend is EE).
 *
 * Port notes:
 * - The three beforeEach cy.intercept aliases (@createDestinationDatabase,
 *   @databaseUpdate, @deleteDatabase) are registered as page.waitForResponse
 *   predicates BEFORE the triggering action, awaited after (PORTING rule 2).
 * - findByText/findByLabelText/findByRole with string args → { exact: true }
 *   (PORTING rule 1); regex args ported as-is.
 * - Mantine Switch toggles: click the labeled input with { force: true }
 *   (PORTING rule 4) — this covers upstream's `.click({ force: true })` and its
 *   `.parent("label").click()`, which toggle the same control.
 * - CAPABILITY PROBE — SETTLED: the disabled-toggle tooltip
 *   (assertDbRoutingDisabled in support/database-routing-admin.ts) uses
 *   Playwright's real hover() where Cypress headless needed
 *   `cy.trigger("mouseenter")` (Chrome v122+ hit-tested CDP mouse events to the
 *   disabled <input> and swallowed the boundary events). Run against a live
 *   writable QA postgres with PW_QA_DB_ENABLED=1, real hover() on the
 *   `database-routing-toggle-wrapper` Box fires the Tooltip reliably — React's
 *   synthetic onMouseEnter fires for descendants, so hitting the inner disabled
 *   input still triggers the wrapper's handler. Dividend confirmed: Playwright
 *   needs no synthetic-event workaround here.
 * - The "Table editing" describe has two upstream tests with an identical title
 *   — Playwright treats duplicate titles as a hard load error, so the second is
 *   suffixed " (2)" faithfully.
 */
import { resolveToken } from "../support/api";
import { isOssBackend } from "../support/admin";
import { commandPaletteSearch } from "../support/filters-repros";
import { commandPalette } from "../support/command-palette";
import { test, expect } from "../support/fixtures";
import { visitDataModel } from "../support/question-saved";
import { TablePicker } from "../support/data-model";
import { startNewNativeQuestion } from "../support/native-editor";
import { miniPicker, entityPickerModal } from "../support/notebook";
import { miniPickerBrowseAll } from "../support/joins";
import { modifyPermission } from "../support/admin-permissions";
import { undoToast } from "../support/metrics";
import { tooltip } from "../support/charts";
import { icon, modal, popover } from "../support/ui";
import {
  ALL_USERS_GROUP,
  BASE_POSTGRES_DESTINATION_DB_INFO,
  QA_POSTGRES_PORT,
  SAMPLE_DB_ID,
  WRITABLE_DB_ID,
  assertDbRoutingDisabled,
  assertDbRoutingNotDisabled,
  configureDbRoutingViaAPI,
  createDestinationDatabasesViaAPI,
  dbConnectionInfoSection,
  dbRoutingSection,
  disableModelActionsViaApi,
  enableGlobalModelPersistence,
  enableModelActionsViaApi,
  enableUploadsViaApi,
  expandDbRouting,
  modelsSection,
  setupModelPersistence,
  tableEditingSection,
  typeAndBlurUsingLabel,
  visitDatabaseAdminPage,
  visitUploadSettingsPage,
} from "../support/database-routing-admin";
import type { Page } from "@playwright/test";

// The whole spec needs the writable QA postgres + its postgres-writable
// snapshot, neither of which is provisioned in this spike.
const skipUnlessQaDb = () =>
  test.skip(
    !process.env.PW_QA_DB_ENABLED,
    "Requires the writable QA postgres database and its postgres-writable snapshot (set PW_QA_DB_ENABLED)",
  );

// @createDestinationDatabase — POST /api/ee/database-routing/destination-database
// (?check_connection_details=true; matched on pathname + method).
function waitForCreateDestination(page: Page) {
  return page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname ===
        "/api/ee/database-routing/destination-database",
  );
}

// @databaseUpdate — PUT /api/database/*
function waitForDatabaseUpdate(page: Page) {
  return page.waitForResponse(
    (r) =>
      r.request().method() === "PUT" &&
      /^\/api\/database\/\d+$/.test(new URL(r.url()).pathname),
  );
}

// @deleteDatabase — DELETE /api/database/*
function waitForDeleteDatabase(page: Page) {
  return page.waitForResponse(
    (r) =>
      r.request().method() === "DELETE" &&
      /^\/api\/database\/\d+$/.test(new URL(r.url()).pathname),
  );
}

/**
 * The `postgres-writable` snapshot ships db 2 with model actions ENABLED, and
 * the backend refuses routing while they are on ("Cannot enable database
 * routing for a database with actions enabled"). Several upstream tests turn
 * them off by clicking the "Model actions" Switch and then immediately proceed;
 * in Cypress the per-command overhead lets the PUT land, but Playwright races
 * it. Anchor on the response instead of sleeping (PORTING rule 2 / FINDINGS
 * #125).
 */
function waitForDatabaseSettingsUpdate(page: Page, databaseId: number) {
  return page.waitForResponse(
    (r) =>
      r.request().method() === "PUT" &&
      new URL(r.url()).pathname === `/api/database/${databaseId}` &&
      r.ok(),
  );
}

/**
 * Port of upstream's repeated
 * `H.undoToast().within(() => { cy.findByText(msg).should("exist");
 * cy.icon("close").click(); })`.
 *
 * `H.undoToast()` is `cy.findByTestId("toast-undo")` — **singular** — so
 * upstream structurally can never have two toasts on screen at a step that uses
 * it. Closing a toast only starts a dismiss animation, and Playwright drives the
 * next action fast enough that the closing toast is still mounted when the
 * following toast appears, which turns the singular locator into a strict-mode
 * violation. Waiting for the close to actually land asserts upstream's implicit
 * one-toast-at-a-time invariant rather than relaxing the locator to `.first()`.
 */
async function closeUndoToast(page: Page, message: string) {
  const toast = undoToast(page);
  await expect(toast.getByText(message, { exact: true })).toBeVisible();
  await icon(toast, "close").click();
  await expect(toast).toHaveCount(0);
}

test.describe("admin > database > database routing", () => {
  skipUnlessQaDb();

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();
  });

  test.describe("EE", () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "requires the pro-self-hosted token (MB_PRO_SELF_HOSTED / CYPRESS_...)",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.api.activateToken("pro-self-hosted");
    });

    test("should be able to configure db routing and manage destination databases", async ({
      page,
      mb,
    }) => {
      // setup
      await visitDatabaseAdminPage(page, WRITABLE_DB_ID);
      // disable model actions
      // As the first test in the file this can land on a just-booted backend,
      // where the admin page renders its feature sections only once the
      // database (and its driver features) have loaded. The default action
      // timeout was not always enough, so anchor on the control being present
      // before clicking it rather than letting the click race the render.
      const modelActions = modelsSection(page).getByLabel("Model actions", {
        exact: true,
      });
      await expect(modelActions).toBeVisible({ timeout: 30_000 });
      const actionsDisabled = waitForDatabaseSettingsUpdate(
        page,
        WRITABLE_DB_ID,
      );
      await modelActions.click({ force: true });
      await actionsDisabled;

      // enabling — turn the feature on
      const enableToggle = page.getByLabel("Enable database routing", {
        exact: true,
      });
      await expect(enableToggle).not.toBeChecked();
      // …and only becomes clickable once the refetched database says actions
      // are off. A forced click on the still-disabled input is a silent no-op,
      // which is what left the "Add" button unrendered.
      await expect(enableToggle).toBeEnabled();
      await enableToggle.click({ force: true }); // mantine toggle hides the real input
      await expect(page.getByRole("button", { name: /Add/ })).toBeDisabled();
      await page.getByTestId("db-routing-user-attribute").click();
      await popover(page).getByText("attr_uid", { exact: true }).click();
      await closeUndoToast(page, "Database routing enabled");

      // configuring — change the user attribute routed on
      await page.getByTestId("db-routing-user-attribute").click();
      await popover(page).getByText("role", { exact: true }).click();
      await closeUndoToast(page, "Database routing updated");

      // database creation
      await expect(
        dbRoutingSection(page).getByText("No destination databases added yet", {
          exact: true,
        }),
      ).toBeVisible();
      await page.getByRole("link", { name: /Add/ }).click();

      {
        const m = modal(page);
        // should not allow changing engine
        await expect(m.getByLabel("Database type")).toHaveCount(0);

        await typeAndBlurUsingLabel(m, /Slug/, "Destination DB 1");
        await typeAndBlurUsingLabel(m, /Host/, "localhost");
        await typeAndBlurUsingLabel(m, /Port/, String(QA_POSTGRES_PORT));
        await typeAndBlurUsingLabel(m, /Database name/, "sample");
        await typeAndBlurUsingLabel(m, /Username/, "metabase");
        await typeAndBlurUsingLabel(m, /Password/, "metasample123");

        const created = waitForCreateDestination(page);
        await m.getByRole("button", { name: "Save", exact: true }).click();
        await created;
      }
      await closeUndoToast(page, "Destination database created successfully");
      await expect(
        dbRoutingSection(page).getByText("Destination DB 1", { exact: true }),
      ).toBeVisible();
      await dbRoutingSection(page)
        .getByTestId("database-connection-health-info")
        .hover();
      await expect(tooltip(page)).toContainText("Connected");

      // should validate destination db creation
      await page.getByRole("link", { name: /Add/ }).click();
      {
        const m = modal(page);
        // should prevent adding a db with the same name
        await typeAndBlurUsingLabel(m, /Slug/, "Destination DB 1");
        await typeAndBlurUsingLabel(m, /Host/, "localhost");
        await typeAndBlurUsingLabel(m, /Port/, String(QA_POSTGRES_PORT));
        await typeAndBlurUsingLabel(m, /Database name/, "sample");
        await typeAndBlurUsingLabel(m, /Username/, "metabase");
        await typeAndBlurUsingLabel(m, /Password/, "metasample123");

        const created1 = waitForCreateDestination(page);
        await m.getByRole("button", { name: "Save", exact: true }).click();
        await created1;
        await expect(
          m.getByText(
            "A destination database with that name already exists.",
            { exact: true },
          ),
        ).toBeVisible();

        // should prevent adding with incorrect connection info
        await typeAndBlurUsingLabel(m, /Slug/, "Unique Destination DB Name");
        await typeAndBlurUsingLabel(m, /Password/, "metasample124");
        const created2 = waitForCreateDestination(page);
        await m.getByRole("button", { name: /(Failed|Save)/ }).click();
        await created2;
        await expect(
          m.getByText("Looks like your Password is incorrect.", {
            exact: true,
          }),
        ).toBeVisible();

        await m.getByRole("button", { name: "Cancel", exact: true }).click();
      }
      await page
        .getByTestId("leave-confirmation")
        .getByRole("button", { name: "Discard changes", exact: true })
        .click();
      await expect(modal(page)).toHaveCount(0);

      // bulk creation via api (how we expect most users to create dest dbs)
      await createDestinationDatabasesViaAPI(mb.api, {
        router_database_id: 2,
        // _.range(2, 7) → [2, 3, 4, 5, 6]
        databases: [2, 3, 4, 5, 6].map((i) => ({
          ...BASE_POSTGRES_DESTINATION_DB_INFO,
          name: `Destination DB ${i}`,
        })),
      });
      await page.reload();
      await expect(
        dbRoutingSection(page).getByText("Destination DB 5", { exact: true }),
      ).toBeVisible();
      await expect(
        dbRoutingSection(page).getByText("Destination DB 6", { exact: true }),
      ).toHaveCount(0);

      // view all destination databases
      await dbRoutingSection(page)
        .getByText("View all 6", { exact: true })
        .click();
      {
        const m = modal(page);
        await expect(
          m.getByText("Destination DB 6", { exact: true }),
        ).toBeVisible();
        await m.getByRole("button", { name: "Close", exact: true }).click();
      }

      // update destination database
      await icon(
        dbRoutingSection(page).getByTestId("destination-db-list-item").first(),
        "ellipsis",
      ).click();
      await popover(page).getByText("Edit", { exact: true }).click();
      {
        const m = modal(page);
        await typeAndBlurUsingLabel(m, /Slug/, " Destination DB 1 Updated");
        const updated = waitForDatabaseUpdate(page);
        await m
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        await updated;
      }
      await closeUndoToast(page, "Destination database updated successfully");

      // remove a database
      await icon(
        dbRoutingSection(page).getByTestId("destination-db-list-item").first(),
        "ellipsis",
      ).click();
      await popover(page).getByText("Remove", { exact: true }).click();
      {
        const m = modal(page);
        await m
          .getByTestId("database-name-confirmation-input")
          .fill("Destination DB 1 Updated");
        const deleted = waitForDeleteDatabase(page);
        await m
          .getByRole("button", { name: "Delete this DB connection", exact: true })
          .click();
        await deleted;
      }
      await expect(
        dbRoutingSection(page).getByText("Destination DB 1 Updated", {
          exact: true,
        }),
      ).toHaveCount(0);

      // turn off routing
      const enableToggle2 = page.getByLabel("Enable database routing", {
        exact: true,
      });
      await expect(enableToggle2).toBeChecked();
      await enableToggle2.click({ force: true }); // mantine toggle hides the real input
      await expect(enableToggle2).not.toBeChecked();
      await closeUndoToast(page, "Database routing disabled");

      // should not remove destination databases when turning the feature off
      await expandDbRouting(page);
      await expect(
        dbRoutingSection(page).getByText("Destination DB 2", { exact: true }),
      ).toBeVisible();
      await expect(
        dbRoutingSection(page).getByText("No destination databases added yet", {
          exact: true,
        }),
      ).toHaveCount(0);
    });

    test("should not leak destinations databases in the application", async ({
      page,
      mb,
    }) => {
      const name = BASE_POSTGRES_DESTINATION_DB_INFO.name;

      // setup db routing via API
      await page.goto("/admin/databases/2");
      // disable model actions
      const actionsDisabled = waitForDatabaseSettingsUpdate(page, 2);
      await page.getByLabel("Model actions", { exact: true }).click({ force: true });
      await actionsDisabled;
      await configureDbRoutingViaAPI(mb.api, {
        router_database_id: 2,
        user_attribute: "role",
      });
      await createDestinationDatabasesViaAPI(mb.api, {
        router_database_id: 2,
        databases: [BASE_POSTGRES_DESTINATION_DB_INFO],
      });

      // validate setup was successful
      await page.reload();
      await expect(
        page.getByLabel("Enable database routing", { exact: true }),
      ).toBeChecked();
      await expect(
        dbRoutingSection(page).getByText(name, { exact: true }),
      ).toBeVisible();

      // should not see destination databases in admin list of database
      await page.goto("/admin/databases");
      await expect(
        page.getByTestId("database-list").getByText(name, { exact: true }),
      ).toHaveCount(0);

      // should not see destination databases in database browser
      await page.goto("/browse/databases");
      await expect(
        page.getByTestId("database-browser").getByText(name, { exact: true }),
      ).toHaveCount(0);

      // should not see destination databases in search
      await commandPaletteSearch(page, name);
      await expect(
        commandPalette(page).getByText("No results for “DestinationDB”", {
          exact: true,
        }),
      ).toBeVisible();

      // should not see database in table metadata db list
      await visitDataModel(page);
      await expect(TablePicker.getDatabase(page, name)).toHaveCount(0);

      // should not see database in permissions pages
      await page.goto("/admin/permissions/data/database");
      await expect(
        page.locator("aside").getByText(name, { exact: true }),
      ).toHaveCount(0);

      // should not see database in data picker
      await page.goto("/question/notebook");
      await expect(
        miniPicker(page).getByText(name, { exact: true }),
      ).toHaveCount(0);
      await miniPickerBrowseAll(page).click();
      await expect(
        entityPickerModal(page).getByText(name, { exact: true }),
      ).toHaveCount(0);

      // should not see database in data reference
      await startNewNativeQuestion(page);
      await icon(page.getByTestId("sidebar-header"), "chevronleft").click();
      await expect(page.getByTestId("sidebar-header-title")).toHaveText(
        "Data Reference",
      );
      await expect(
        page.getByTestId("sidebar-header-title").getByText(name, { exact: true }),
      ).toHaveCount(0);
    });

    test("should not allow turning on db routing on if other conflicting features are enabled", async ({
      page,
    }) => {
      // setup
      await setupModelPersistence(page);
      await visitDatabaseAdminPage(page, WRITABLE_DB_ID);

      // should be disabled if model actions is enabled
      await expect(
        page.getByLabel("Model actions", { exact: true }),
      ).toBeChecked();
      await assertDbRoutingDisabled(page);

      await page.getByLabel("Model actions", { exact: true }).click({ force: true });

      await assertDbRoutingNotDisabled(page);

      // should be disabled if model persistence is enabled
      const modelPersistence = page.getByLabel("Model persistence", {
        exact: true,
      });
      await expect(modelPersistence).not.toBeChecked();
      await modelPersistence.click({ force: true });

      await assertDbRoutingDisabled(page);
      const modelPersistenceInSection = modelsSection(page).getByLabel(
        "Model persistence",
        { exact: true },
      );
      await expect(modelPersistenceInSection).toBeChecked();
      await modelPersistenceInSection.click({ force: true });
      await assertDbRoutingNotDisabled(page);

      // should be disabled if uploads are enabled for the database
      await page.goto("/admin/settings/uploads");
      await page
        .getByLabel("Upload Settings Form")
        .getByPlaceholder("Select a database", { exact: true })
        .click();
      await popover(page).getByText("Writable Postgres12", { exact: true }).click();
      await page
        .getByLabel("Upload Settings Form")
        .getByPlaceholder("Select a schema", { exact: true })
        .click();
      await popover(page).getByText("public", { exact: true }).click();
      await page
        .getByLabel("Upload Settings Form")
        .getByRole("button", { name: "Enable uploads", exact: true })
        .click();

      await visitDatabaseAdminPage(page, WRITABLE_DB_ID);
      await assertDbRoutingDisabled(page);
    });

    test("should highlight that a dabtabase has routing enabled on the permissions pages", async ({
      page,
      mb,
    }) => {
      // setup
      await mb.api.put("/api/database/2", {
        settings: { "database-enable-actions": false },
      });
      await configureDbRoutingViaAPI(mb.api, {
        router_database_id: 2,
        user_attribute: "role",
      });

      // should highlight on group perms page at db level
      await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);
      await expect(
        page
          .getByTestId("permission-table")
          .getByText("(Database routing enabled)", { exact: true }),
      ).toBeVisible();

      // should highlight on group perms page at table level
      await page.goto(
        `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/2`,
      );
      await expect(
        page
          .getByTestId("permissions-editor-breadcrumbs")
          .getByText("(Database routing enabled)", { exact: true }),
      ).toBeVisible();

      // should highlight on db perms page at table level
      await page.goto("/admin/permissions/data/database/2");
      await expect(
        page
          .getByTestId("permissions-editor-breadcrumbs")
          .getByText("(Database routing enabled)", { exact: true }),
      ).toBeVisible();
    });

    test.describe("feature visibility", () => {
      test("should only show db routing for valid database types", async ({
        page,
      }) => {
        // should not show for sample databases
        await visitDatabaseAdminPage(page, SAMPLE_DB_ID);
        await expect(dbConnectionInfoSection(page)).toBeVisible();
        await expect(dbRoutingSection(page)).toHaveCount(0);

        // should not show for attached data warehouses — mutate the GET response
        await page.route(
          (url) =>
            new URL(url).pathname === `/api/database/${SAMPLE_DB_ID}`,
          async (route) => {
            const response = await route.fetch();
            const body = await response.json();
            body.is_attached_dwh = true;
            body.is_sample = false;
            await route.fulfill({ response, json: body });
          },
        );
        await page.reload();
        await expect(dbConnectionInfoSection(page)).toBeVisible();
        await expect(dbRoutingSection(page)).toHaveCount(0);
      });

      test("should show for users with db management permissions but prevent removal of destination databases", async ({
        page,
        mb,
      }) => {
        // setup - db routing
        await page.goto("/admin/databases/2");
        await visitDatabaseAdminPage(page, WRITABLE_DB_ID);
        // The postgres-writable snapshot has model actions ENABLED on db 2
        // (see the "feature compatibility" describe, which disables them via
        // the API for the same reason). Routing cannot be configured while
        // they are on: the backend answers 400 "Cannot enable database routing
        // for a database with actions enabled".
        //
        // The toggle's PUT is async, so the bare click raced the API call
        // below and the 400 landed intermittently. Anchor on the response
        // rather than a sleep — same race, and same fix, as FINDINGS #125.
        const actionsDisabled = waitForDatabaseSettingsUpdate(
          page,
          WRITABLE_DB_ID,
        );
        await modelsSection(page)
          .getByLabel("Model actions", { exact: true })
          .click({ force: true });
        await actionsDisabled;
        await configureDbRoutingViaAPI(mb.api, {
          router_database_id: 2,
          user_attribute: "role",
        });
        await createDestinationDatabasesViaAPI(mb.api, {
          router_database_id: 2,
          databases: [BASE_POSTGRES_DESTINATION_DB_INFO],
        });

        // normal user should not see db routing
        await mb.signOut();
        await mb.signInAsNormalUser();
        await visitDatabaseAdminPage(page, WRITABLE_DB_ID);
        await expect(
          page
            .locator("main")
            .getByText("Sorry, you don’t have permission to see that.", {
              exact: true,
            }),
        ).toBeVisible();

        // grant db management permissions to all users
        await mb.signOut();
        await mb.signInAsAdmin();
        await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);
        // NOTE: manage db permissions currently do not work in master w/o
        // having create queries permissions, so grant this too.
        const CREATE_QUERIES_PERMISSION_INDEX = 1;
        await modifyPermission(
          page,
          "Writable Postgres12",
          CREATE_QUERIES_PERMISSION_INDEX,
          "Query builder and native",
        );
        const MANAGE_DATABASE_PERMISSION_INDEX = 4;
        await modifyPermission(
          page,
          "Writable Postgres12",
          MANAGE_DATABASE_PERMISSION_INDEX,
          "Yes",
        );
        await page.getByRole("button", { name: "Save changes", exact: true }).click();
        await modal(page).getByRole("button", { name: "Yes", exact: true }).click();

        // normal user should see db
        await mb.signOut();
        await mb.signIn("normal");
        await visitDatabaseAdminPage(page, WRITABLE_DB_ID);
        await expect(dbRoutingSection(page)).toBeVisible();
        // should not be able to manage db routing settings
        await expect(
          dbRoutingSection(page).getByLabel("Enable database routing", {
            exact: true,
          }),
        ).toBeDisabled();
        await expect(
          dbRoutingSection(page).getByTestId("db-routing-user-attribute"),
        ).toBeDisabled();
        await expect(
          dbRoutingSection(page).getByRole("button", { name: /Add/ }),
        ).toHaveCount(0);

        // should be able to edit databases
        await icon(
          dbRoutingSection(page).getByTestId("destination-db-list-item"),
          "ellipsis",
        ).click();
        {
          const pop = popover(page);
          await expect(pop.getByText("Remove", { exact: true })).toHaveCount(0);
          await expect(pop.getByText("Edit", { exact: true })).toBeVisible();
          await pop.getByText("Edit", { exact: true }).click();
        }
        {
          const m = modal(page);
          await typeAndBlurUsingLabel(m, /Slug/, "Destination DB 1");
          const updated = waitForDatabaseUpdate(page);
          await m
            .getByRole("button", { name: "Save changes", exact: true })
            .click();
          await updated;
        }
      });
    });

    test.describe("feature compatibility", () => {
      test.beforeEach(async ({ mb }) => {
        // disable model actions since it is enabled by default for this db
        await disableModelActionsViaApi(mb.api, WRITABLE_DB_ID);
      });

      test.describe("model actions", () => {
        test("should not be possible to enable model actions when database routing is enabled", async ({
          page,
          mb,
        }) => {
          await configureDbRoutingViaAPI(mb.api, {
            router_database_id: WRITABLE_DB_ID,
            user_attribute: "role",
          });

          await visitDatabaseAdminPage(page, WRITABLE_DB_ID);

          const section = modelsSection(page);
          await expect(
            section.getByLabel("Model actions", { exact: true }),
          ).toBeDisabled();
          const message = section.getByText(
            "Model actions can't be enabled when database routing is enabled.",
            { exact: true },
          );
          await message.scrollIntoViewIfNeeded();
          await expect(message).toBeVisible();
        });

        test("should not be possible to enable database routing when model actions are enabled", async ({
          page,
          mb,
        }) => {
          await enableModelActionsViaApi(mb.api, WRITABLE_DB_ID);
          await visitDatabaseAdminPage(page, WRITABLE_DB_ID);

          const section = dbRoutingSection(page);
          await expect(
            section.getByLabel("Enable database routing", { exact: true }),
          ).toBeDisabled();
          const message = section.getByText(
            "Database routing can't be enabled if model actions are enabled.",
            { exact: true },
          );
          await message.scrollIntoViewIfNeeded();
          await expect(message).toBeVisible();
        });
      });

      test.describe("model persistence", () => {
        test.beforeEach(async ({ page }) => {
          await enableGlobalModelPersistence(page);
        });

        test("should not be possible to enable model persistence when database routing is enabled", async ({
          page,
          mb,
        }) => {
          await configureDbRoutingViaAPI(mb.api, {
            router_database_id: WRITABLE_DB_ID,
            user_attribute: "role",
          });

          await visitDatabaseAdminPage(page, WRITABLE_DB_ID);
          const section = modelsSection(page);
          await expect(
            section.getByLabel("Model persistence", { exact: true }),
          ).toBeDisabled();
          const message = section.getByText(
            "Model persistence can't be enabled when database routing is enabled.",
            { exact: true },
          );
          await message.scrollIntoViewIfNeeded();
          await expect(message).toBeVisible();
        });

        test("should not be possible to enable database routing when model persistence enabled", async ({
          page,
        }) => {
          await visitDatabaseAdminPage(page, WRITABLE_DB_ID);
          await modelsSection(page)
            .getByLabel("Model persistence", { exact: true })
            .click({ force: true });

          const section = dbRoutingSection(page);
          await expect(
            section.getByLabel("Enable database routing", { exact: true }),
          ).toBeDisabled();
          const message = section.getByText(
            "Database routing can't be enabled if model persistence is enabled.",
            { exact: true },
          );
          await message.scrollIntoViewIfNeeded();
          await expect(message).toBeVisible();
        });
      });

      test.describe("Table editing", () => {
        test("should not be possible to enable table editing when database routing is enabled", async ({
          page,
          mb,
        }) => {
          await configureDbRoutingViaAPI(mb.api, {
            router_database_id: WRITABLE_DB_ID,
            user_attribute: "role",
          });

          await visitDatabaseAdminPage(page, WRITABLE_DB_ID);

          const section = tableEditingSection(page);
          await expect(
            section.getByLabel("Editable tables", { exact: true }),
          ).toBeDisabled();
          const message = section.getByText(
            "Table editing can't be enabled when database routing is enabled.",
            { exact: true },
          );
          await message.scrollIntoViewIfNeeded();
          await expect(message).toBeVisible();
        });

        // Upstream repeats the previous title verbatim; Playwright rejects
        // duplicate titles, so the second (reverse-direction) case is suffixed.
        test("should not be possible to enable table editing when database routing is enabled (2)", async ({
          page,
        }) => {
          await visitDatabaseAdminPage(page, WRITABLE_DB_ID);

          await tableEditingSection(page)
            .getByLabel("Editable tables", { exact: true })
            .click({ force: true });

          const section = dbRoutingSection(page);
          await expect(
            section.getByLabel("Enable database routing", { exact: true }),
          ).toBeDisabled();
          const message = section.getByText(
            "Database routing can't be enabled when table editing is enabled.",
            { exact: true },
          );
          await message.scrollIntoViewIfNeeded();
          await expect(message).toBeVisible();
        });
      });

      test.describe("Uploads", () => {
        test("should not be possible to enable uploads when database routing is enabled", async ({
          page,
          mb,
        }) => {
          await configureDbRoutingViaAPI(mb.api, {
            router_database_id: WRITABLE_DB_ID,
            user_attribute: "role",
          });

          await visitUploadSettingsPage(page);

          await page.getByLabel("Database to use for uploads").click();
          await expect(
            popover(page).getByText(
              "Writable Postgres12 (DB Routing Enabled)",
              { exact: true },
            ),
          ).toBeVisible();
        });

        test("should not be possible to enable database routing when uploads are enabled", async ({
          page,
          mb,
        }) => {
          await enableUploadsViaApi(mb.api);
          await visitDatabaseAdminPage(page, WRITABLE_DB_ID);

          const section = dbRoutingSection(page);
          await expect(
            section.getByLabel("Enable database routing", { exact: true }),
          ).toBeDisabled();
          const message = section.getByText(
            "Database routing can't be enabled if uploads are enabled for this database.",
            { exact: true },
          );
          await message.scrollIntoViewIfNeeded();
          await expect(message).toBeVisible();
        });
      });
    });
  });

  test.describe("OSS", () => {
    test("should not show the feature if not enabled in token features", async ({
      page,
      mb,
    }) => {
      test.skip(
        !(await isOssBackend(mb.api)),
        "@OSS-only test — requires an OSS build (this spike backend is EE)",
      );

      await page.goto("/admin/databases/2");
      await expect(dbConnectionInfoSection(page)).toBeVisible();
      await expect(dbRoutingSection(page)).toHaveCount(0);
    });
  });
});

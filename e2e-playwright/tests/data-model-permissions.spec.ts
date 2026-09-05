/**
 * Playwright port of
 * e2e/test/scenarios/permissions/data-model-permissions.cy.spec.js
 *
 * Per-group data-model edit permission: who can edit table/field metadata.
 * The data-model admin area is gated by this permission at the none/edit
 * ("No"/"Yes") levels, per table or for a whole database. Gated on the EE
 * `pro-self-hosted` token (the jar activates it).
 *
 * Notes:
 * - Permission levels are set through the admin data-permissions UI exactly as
 *   upstream (`modifyPermission` reused read-only). `savePermissionsGraph`
 *   confirms the save modal (new helper).
 * - `cy.wait("@tableMetadataFetch")` / `@tableUpdate` → `waitForResponse`
 *   predicates registered BEFORE the triggering action (rule 2), via
 *   `waitForTableMetadata` / `waitForTableUpdate`.
 * - The name input is an EditableText metadata field: `fill()` doesn't mark it
 *   dirty, so clear+type is driven with real keystrokes and committed on blur
 *   (PORTING.md EditableText gotcha).
 * - `cy.signIn("none")` → `signInWithCachedSession` (the "none" user is outside
 *   the mb fixture's typed USERS map). API calls after it still run as admin,
 *   but test #3 only navigates the browser, which uses the injected cookie.
 * - `undoToast().should("contain.text", …)` → `.first()` (transient toasts can
 *   leave a lingering duplicate under CI load).
 */
import { modifyPermission } from "../support/admin-permissions";
import { resolveToken } from "../support/api";
import { goToAdmin } from "../support/command-palette";
import {
  FieldSection,
  SAMPLE_DB_SCHEMA_ID,
  TablePicker,
  TableSection,
  visitDataModel,
  waitForTableUpdate,
} from "../support/data-model";
import {
  savePermissionsGraph,
  waitForTableMetadata,
} from "../support/data-model-permissions";
import { assertPermissionForItem } from "../support/download-permissions";
import { test, expect } from "../support/fixtures";
import { undoToast } from "../support/metrics";
import { signInWithCachedSession } from "../support/permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const DATA_ACCESS_PERMISSION_INDEX = 0;
const DATA_MODEL_PERMISSION_INDEX = 3;

test.describe("scenarios > admin > permissions", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "EE data-model permissions require the pro-self-hosted token",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("allows data model permission for a table in database", async ({
    page,
    mb,
  }) => {
    await page.goto(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
    // Change permission
    await modifyPermission(
      page,
      "All Users",
      DATA_ACCESS_PERMISSION_INDEX,
      "Granular",
    );
    await modifyPermission(page, "Orders", DATA_MODEL_PERMISSION_INDEX, "Yes");

    await savePermissionsGraph(page);

    // Assert the permission has changed
    await assertPermissionForItem(
      page,
      "Orders",
      DATA_MODEL_PERMISSION_INDEX,
      "Yes",
    );

    // Check limited access as a non-admin user
    await mb.signInAsNormalUser();
    await page.goto("/");

    // Go to the admin settings
    await goToAdmin(page);

    // Assert the Data Model page state
    await expect(
      page.getByText("Table Metadata", { exact: true }),
    ).toBeVisible();

    const tableMetadataFetch = waitForTableMetadata(page);
    await TablePicker.getTable(page, "Orders").click();
    await tableMetadataFetch;

    // Update the table name
    const nameInput = TableSection.getNameInput(page);
    await expect(nameInput).toHaveValue("Orders");
    await nameInput.click();
    await nameInput.press("ControlOrMeta+A");
    await nameInput.press("Backspace");
    await expect(nameInput).toHaveValue("");

    const tableUpdate = waitForTableUpdate(page);
    const tableMetadataRefetch = waitForTableMetadata(page);
    await nameInput.pressSequentially("Changed Name");
    await nameInput.blur();
    await tableUpdate;
    await tableMetadataRefetch;

    await expect(undoToast(page).first()).toContainText("Table name updated");

    // Update the table visibility
    const changedRow = TablePicker.getTable(page, "Changed Name");
    await changedRow.hover();
    await changedRow
      .getByRole("button", { name: "Hide table", exact: true })
      .click();
    await expect(
      changedRow.getByRole("button", { name: "Hide table", exact: true }),
    ).toHaveCount(0);
    await expect(
      changedRow.getByRole("button", { name: "Unhide table", exact: true }),
    ).toBeVisible();
  });

  test("allows changing data model permission for an entire database", async ({
    page,
    mb,
  }) => {
    await page.goto(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
    // Change data model permission
    await modifyPermission(
      page,
      "All Users",
      DATA_MODEL_PERMISSION_INDEX,
      "Yes",
    );

    await savePermissionsGraph(page);

    // Assert the permission has changed
    await assertPermissionForItem(
      page,
      "All Users",
      DATA_MODEL_PERMISSION_INDEX,
      "Yes",
    );

    // Check limited access as a non-admin user
    await mb.signInAsNormalUser();
    await page.goto("/");

    // Go to the admin settings
    await goToAdmin(page);

    // Assert the Data Model page state
    await expect(
      page.getByText("Table Metadata", { exact: true }),
    ).toBeVisible();
    await expect(TablePicker.getTables(page)).toHaveCount(8);
    await expect(TablePicker.getTable(page, "Accounts")).toBeVisible();
    await expect(TablePicker.getTable(page, "Analytic Events")).toBeVisible();
    await expect(TablePicker.getTable(page, "Feedback")).toBeVisible();
    await expect(TablePicker.getTable(page, "Invoices")).toBeVisible();
    await expect(TablePicker.getTable(page, "Orders")).toBeVisible();
    await expect(TablePicker.getTable(page, "People")).toBeVisible();
    await expect(TablePicker.getTable(page, "Products")).toBeVisible();
    await expect(TablePicker.getTable(page, "Reviews")).toBeVisible();
  });

  test("shows `Field access denied` for foreign keys from tables user does not have access to (metabase#21762)", async ({
    page,
  }) => {
    await page.goto(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
    // Change data model permission
    await modifyPermission(
      page,
      "All Users",
      DATA_MODEL_PERMISSION_INDEX,
      "Granular",
    );
    await modifyPermission(page, "Orders", DATA_MODEL_PERMISSION_INDEX, "Yes");

    await savePermissionsGraph(page);

    // Check limited access as a non-admin user
    await signInWithCachedSession(page.context(), "none");
    await visitDataModel(page, "admin", {
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.USER_ID,
    });

    // Look at foreign key from table the user does not have access to
    const fkTarget = FieldSection.getSemanticTypeFkTarget(page);
    await expect(fkTarget).toHaveAttribute("placeholder", "Field access denied");
    await expect(fkTarget).toHaveValue("");
  });
});

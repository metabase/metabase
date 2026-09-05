/**
 * Playwright port of e2e/test/scenarios/admin-2/people.cy.spec.js
 *
 * INFRA TIER — **email-settings only. NOT the QA-database tier, and (as
 * ported) not even the maildev tier.** Nothing here restores a `*-writable`
 * snapshot or touches an external SQL container, so `PW_QA_DB_ENABLED` is
 * irrelevant. The two `@external` tags both mean "SMTP must be configured":
 *   - "should reset user password with SMTP set up"
 *   - the `email configured` describe (invite member when SSO is not configured)
 * plus one untagged test that also calls `H.setupSMTP()` ("invite member when
 * SSO is configured metabase#23630").
 *
 * None of the three reads an inbox. Each asserts FE copy that is gated purely
 * on the `email-configured?` session property, which the backend derives as
 * `(boolean (email-smtp-host))` (`src/metabase/channel/settings.clj:301`), and
 * the password-reset send itself happens inside a `future` so
 * `POST /api/session/forgot_password` answers 204 regardless of whether an SMTP
 * server is reachable (`src/metabase/session/api.clj:263`). So all three use
 * `configureSmtpSettings` (support/admin-extras.ts), which writes the same
 * settings through the bulk `/api/setting` endpoint without the live SMTP
 * validation that `H.setupSMTP`'s `PUT /api/email` performs. Result: **three
 * would-be gate-skips converted into real executed coverage, and this spec has
 * no container dependency at all.**
 *
 * Deviations, all deliberate:
 *
 * - `assertTableRowsCount` ports what upstream actually executes: its
 *   `findByTestId(...).get("table tbody tr")` chain resets the subject at
 *   `.get()`, so the real selector is page-wide. See support/admin-people.ts.
 * - `cy.wait("@alias")` → `page.waitForResponse` registered before the trigger
 *   (rule 2). Never-awaited intercepts (`getGroups` / `listApiKeys` outside the
 *   two tests that await them) are dropped.
 * - `findByText`/`findByLabelText`/`cy.button` with string arguments are exact
 *   matches (rule 1). Bare `cy.findByText(x)` existence checks are ported as
 *   `toBeVisible()` — a mild strengthening, and the house pattern in the
 *   sibling admin-settings port.
 * - The `issue 23689` describe is `test.describe.skip`: upstream's `beforeEach`
 *   opens with `cy.skipOn(true)` and a "remove when this issue gets fixed"
 *   TODO, so it has never run. The body is ported anyway so the skip stays
 *   honest about what is being skipped.
 * - The group-members membership-type toggle is hover-gated by CSS
 *   (`visibility: hidden` until `.cell:hover`), so `realHover()` ports to a
 *   real `hover()` on the cell followed by the click — see `toggleUserTypeInRow`.
 * - `TEST_USER.email` is randomised at module load exactly like upstream. Each
 *   test does its own `mb.restore()` first, so reuse across tests is safe.
 */
import { resolveToken } from "../support/api";
import { configureSmtpSettings } from "../support/admin-extras";
import {
  ALL_USERS,
  TOTAL_GROUPS,
  TOTAL_USERS,
  USER_GROUPS,
  assertLinkMatchesUrl,
  assertTableRowsCount,
  clickButton,
  confirmLosingAbilityToManageGroup,
  generateGroups,
  generateUsers,
  getFullName,
  removeUserFromGroup,
  setupGoogleAuth,
  showUserOptions,
  toggleUserTypeInRow,
  userRow,
} from "../support/admin-people";
import { createApiKey } from "../support/api-keys";
import { goToAdmin } from "../support/command-palette";
import { createQuestionAndDashboard } from "../support/factories";
import { findByDisplayValue } from "../support/filters-repros";
import { expect, test } from "../support/fixtures";
import { undoToast } from "../support/metrics";
import {
  createPulse,
  createQuestionAlert,
  getCurrentUserId,
} from "../support/onboarding-extras";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { icon, modal, popover } from "../support/ui";
import { NORMAL_USER_ID } from "../support/user-settings";

const { ORDERS_ID } = SAMPLE_DATABASE;
const { ALL_USERS_GROUP, COLLECTION_GROUP, DATA_GROUP } = USER_GROUPS;

const { admin, normal, nocollection } = ALL_USERS;

const TEST_USER = {
  first_name: "Testy",
  last_name: "McTestface",
  email: `testy${Math.round(Math.random() * 100000)}@metabase.test`,
  password: "12341234",
};

const adminUserName = getFullName(admin);
const noCollectionUserName = getFullName(nocollection);
const normalUserName = getFullName(normal);

/** Cypress's `normal` USERS entry, for the tests that read its raw fields. */
const NORMAL_USER = {
  ...normal,
  email: "normal@metabase.test",
};

function pathnameIs(page: import("@playwright/test").Page, pathname: string) {
  // cy.location().should(...) retries; a one-shot URL read catches transient
  // states (PORTING: hash/URL assertions must be expect.poll).
  return expect
    .poll(() => new URL(page.url()).pathname)
    .toBe(pathname);
}

test.describe("scenarios > admin > people", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("user management", () => {
    test("should be possible to switch beteween 'People' and 'Groups' tabs and to add/remove users to groups (metabase-enterprise#210, metabase#12693, metabase#21521)", async ({
      page,
    }) => {
      await page.goto("/admin/people");

      await assertTableRowsCount(page, TOTAL_USERS);
      await expect(
        page.getByText(`${TOTAL_USERS} people found`, { exact: true }),
      ).toBeVisible();

      // A small sidebar selector
      const sidebar = page.getByTestId("admin-layout-sidebar");
      // cy.contains(str) is a case-sensitive substring yielding the DEEPEST
      // matching element — here the Mantine NavLink label span, which is what
      // carries the text. data-active lives on the NavLink root, so the
      // assertion is anchored on the link itself.
      await expect(
        sidebar.getByRole("link", { name: "People" }),
      ).toHaveAttribute("data-active", "true");
      // cy.log("Switch to 'Groups' and make sure it renders properly")
      await sidebar.getByText("Groups", { exact: true }).click();
      await expect(sidebar.getByRole("link", { name: "Groups" })).toHaveAttribute(
        "data-active",
        "true",
      );

      await expect(
        page.getByTestId("admin-layout-content").getByText("Groups", {
          exact: true,
        }),
      ).toBeVisible();
      await assertTableRowsCount(page, TOTAL_GROUPS);

      // cy.log("Dig into one of the user groups and make sure its members are listed")
      await page.getByText("All Users", { exact: true }).click();
      await expect(
        page.getByTestId("admin-pane-page-title"),
      ).toContainText("All Users");

      // The same list as for "People"
      await assertTableRowsCount(page, TOTAL_USERS);
      await expect(
        page.getByText(`${TOTAL_USERS} members`, { exact: true }),
      ).toBeVisible();

      // We cannot add new users to the "All users" group directly
      await expect(
        page.getByRole("button", { name: "Add members", exact: true }),
      ).toHaveCount(0);

      // Navigate to the collection group using the UI
      const GROUP = "collection";

      await sidebar.getByText("Groups", { exact: true }).click();
      await expect(
        page
          .locator("tr")
          .filter({ has: page.getByText(GROUP, { exact: true }) }),
      ).toContainText("4");
      await page.getByText(GROUP, { exact: true }).click();

      await expect(page.getByText("4 members", { exact: true })).toBeVisible();

      await clickButton(page, "Add members");
      // The AddRow input is autoFocus'd; cy.focused().type(...) types into it.
      const memberInput = page.getByLabel("Search for a user to add", {
        exact: true,
      });
      await expect(memberInput).toBeFocused();
      await memberInput.pressSequentially(admin.first_name);
      await page.getByText(adminUserName, { exact: true }).click();
      // Selecting a user resets the query to "", which re-opens the suggestion
      // Popover over everything below the row; blur the input before the
      // submit click (PORTING: submitting while a pill/autocomplete input
      // holds focus silently does nothing).
      await memberInput.blur();
      await clickButton(page, "Add");

      await expect(page.getByText("5 members", { exact: true })).toBeVisible();

      await removeUserFromGroup(page, adminUserName);
      await expect(page.getByText("4 members", { exact: true })).toBeVisible();

      // should load the members when navigating to the group directly
      await page.goto(`/admin/people/groups/${DATA_GROUP}`);

      await expect(page.getByText("2 members", { exact: true })).toBeVisible();

      await sidebar.getByText("People", { exact: true }).click();

      await showUserOptions(page, noCollectionUserName);

      await popover(page)
        .getByText("Deactivate user", { exact: true })
        .click();

      await clickButton(page, "Deactivate");

      await page.getByRole("link", { name: /group/i }).click();

      await page
        .getByRole("table")
        .getByRole("link", { name: /data$/i })
        .click();

      await expect(page.getByText("1 member", { exact: true })).toBeVisible();

      await removeUserFromGroup(page, normalUserName);
      await expect(page.getByText("0 members", { exact: true })).toBeVisible();
      await expect(
        page.getByText("Add members to get started.", { exact: true }),
      ).toBeVisible();
    });

    // { tags: "@prerelease" } — no gating equivalent here; the tag only
    // selects the test into the prerelease Cypress run.
    test("should allow admin to create new users", async ({ page }) => {
      const { first_name, last_name, email } = TEST_USER;
      const FULL_NAME = `${first_name} ${last_name}`;
      await page.goto("/admin/people");
      await clickButton(page, "Invite someone");

      // first modal
      await page.getByLabel("First name", { exact: true }).fill(first_name);
      await page.getByLabel("Last name", { exact: true }).fill(last_name);
      await page.getByLabel(/Email/).fill(email);
      await clickButton(page, "Create");

      // second modal
      await expect(
        page.getByText(`${FULL_NAME} has been added`, { exact: true }),
      ).toBeVisible();
      await page.getByText("Done", { exact: true }).click();

      await expect(page.getByText(FULL_NAME, { exact: true })).toBeVisible();
      await pathnameIs(page, "/admin/people");
    });

    test("should allow admin to create new users without first name or last name (metabase#22754)", async ({
      page,
    }) => {
      const { email } = TEST_USER;
      await page.goto("/admin/people");
      await clickButton(page, "Invite someone");

      await page.getByLabel(/Email/).fill(email);
      await clickButton(page, "Create");

      // second modal
      await expect(
        page.getByText(`${email} has been added`, { exact: true }),
      ).toBeVisible();
      await page.getByText("Done", { exact: true }).click();

      await expect(page.getByText(email, { exact: true })).toBeVisible();
    });

    test("should disallow admin to create new users with case mutation of existing user", async ({
      page,
    }) => {
      const { first_name, last_name, email } = NORMAL_USER;
      await page.goto("/admin/people");
      await clickButton(page, "Invite someone");

      await page
        .getByLabel("First name", { exact: true })
        .fill(first_name + "New");
      await page
        .getByLabel("Last name", { exact: true })
        .fill(last_name + "New");
      await page.getByLabel(/Email/).fill(email.toUpperCase());
      await clickButton(page, "Create");
      // cy.contains() is a case-sensitive substring, first match.
      await expect(
        page.getByText("Email address already in use.").first(),
      ).toBeVisible();
    });

    test("should immediately reflect admin privileges when creating user with admin group (metabase#60241)", async ({
      page,
    }) => {
      const { first_name, last_name, email } = TEST_USER;
      const FULL_NAME = `${first_name} ${last_name}`;

      await page.goto("/admin/people");
      await clickButton(page, "Invite someone");

      // Fill in user details
      await page.getByLabel("First name", { exact: true }).fill(first_name);
      await page.getByLabel("Last name", { exact: true }).fill(last_name);
      await page.getByLabel(/Email/).fill(email);

      // Add user to Administrators group
      const dialog = modal(page);
      await dialog
        .getByRole("combobox", { name: "Groups", exact: true })
        .click();
      await popover(page)
        .getByText("Administrators", { exact: true })
        .click();
      // dismiss the open dropdown so it doesn't cover the submit button
      await dialog.getByText("Create user", { exact: true }).click();

      await clickButton(page, "Create");

      // Close the success modal
      await expect(
        dialog.getByText(`${FULL_NAME} has been added`, { exact: true }),
      ).toBeVisible();
      await dialog.getByText("Done", { exact: true }).click();

      // Verify the user appears in the list with Admin role
      const table = page.getByTestId("admin-people-list-table");
      await expect(
        table
          .locator("tr")
          .filter({ has: page.getByText(FULL_NAME, { exact: true }) })
          .getByText("Admin", { exact: true }),
      ).toHaveCount(1);
    });

    test("'Invite someone' button shouldn't be covered/blocked on smaller screen sizes (metabase#16350)", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1000, height: 600 });

      await page.goto("/admin/people");
      await page
        .getByRole("button", { name: "Invite someone", exact: true })
        .click();
      // Modal should appear with the following input field
      await expect(
        page.getByLabel("First name", { exact: true }),
      ).toBeVisible();
    });

    test("should disallow admin to deactivate themselves", async ({ page }) => {
      await page.goto("/admin/people");
      await showUserOptions(page, adminUserName);
      const menu = popover(page);
      await expect(menu.getByText("Edit user", { exact: true })).toBeVisible();
      await expect(
        menu.getByText("Reset password", { exact: true }),
      ).toBeVisible();
      await expect(
        menu.getByText("Deactivate user", { exact: true }),
      ).toHaveCount(0);
    });

    test("should allow admin to deactivate and reactivate other admins/users", async ({
      page,
      mb,
    }) => {
      // Turn a random existing user into an admin
      const response = await mb.api.put(`/api/user/${NORMAL_USER_ID}`, {
        is_superuser: true,
      });
      const user = (await response.json()) as {
        first_name: string;
        last_name: string;
      };
      const FULL_NAME = getFullName(user);

      await page.goto("/admin/people");
      await showUserOptions(page, FULL_NAME);

      await page.getByText("Deactivate user", { exact: true }).click();
      await clickButton(page, "Deactivate");
      await expect(page.getByText(FULL_NAME, { exact: true })).toHaveCount(0);
      await pathnameIs(page, "/admin/people");

      // cy.log("It should load inactive users")
      await page.getByText("Deactivated", { exact: true }).click();
      await expect(page.getByText(FULL_NAME, { exact: true })).toBeVisible();
      await icon(page, "refresh").click();
      await expect(
        page.getByText(`Reactivate ${FULL_NAME}?`, { exact: true }),
      ).toBeVisible();
      await clickButton(page, "Reactivate");
      await pathnameIs(page, "/admin/people");
    });

    test("should edit existing user details", async ({ page }) => {
      const NEW_NAME = "John";
      const NEW_FULL_NAME = `${NEW_NAME} ${NORMAL_USER.last_name}`;

      await page.goto("/admin/people");
      await showUserOptions(page, normalUserName);
      await page.getByText("Edit user", { exact: true }).click();

      const dialog = modal(page);
      // cy.log("Should display error messages (metabase#46449)")
      const firstName = dialog.getByLabel("First name", { exact: true });
      await firstName.click();
      await firstName.fill(" ");
      await clickButton(dialog, "Update");
      await expect(dialog.getByText(/non-blank string./)).toBeVisible();

      await firstName.click();
      await firstName.fill(NEW_NAME);
      await clickButton(dialog, "Update");

      await expect(
        page.getByText(NEW_FULL_NAME, { exact: true }),
      ).toBeVisible();
      await pathnameIs(page, "/admin/people");
    });

    test("should reset user password without SMTP set up", async ({ page }) => {
      await page.goto("/admin/people");
      await showUserOptions(page, normalUserName);
      await page.getByText("Reset password", { exact: true }).click();
      await expect(
        page.getByText(`Reset ${normalUserName}'s password?`, { exact: true }),
      ).toBeVisible();

      const dialog = modal(page);
      await expect(
        dialog.getByText("Are you sure you want to do this?", { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Cancel", exact: true }),
      ).toHaveCount(1);
      await expect(
        dialog.getByRole("button", { name: "Get reset link", exact: true }),
      ).toHaveCount(1);
      await dialog
        .getByRole("button", { name: "Reset password", exact: true })
        .click();

      await expect(
        page.getByText(`${normalUserName}'s password has been reset`, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByText(/^temporary password$/i)).toBeVisible();
      await clickButton(page, "Done");
      await pathnameIs(page, "/admin/people");
    });

    test("should generate a password reset link without SMTP set up", async ({
      page,
    }) => {
      await page.goto("/admin/people");
      await showUserOptions(page, normalUserName);
      await page.getByText("Reset password", { exact: true }).click();

      const dialog = modal(page);
      await expect(
        dialog.getByText(`Reset ${normalUserName}'s password?`, {
          exact: true,
        }),
      ).toBeVisible();

      const resetUrl = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          /^\/api\/user\/[^/]+\/password-reset-url$/.test(
            new URL(response.url()).pathname,
          ),
      );
      await dialog
        .getByRole("button", { name: "Get reset link", exact: true })
        .click();
      await resetUrl;

      await expect(
        dialog.getByText(`Password reset link for ${normalUserName}`, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        dialog.getByText(
          "Share this link with the user. It will expire in 48 hours.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(dialog.getByRole("textbox")).toHaveValue(
        /reset_password/,
      );
      await dialog.getByRole("button", { name: "Done", exact: true }).click();

      await pathnameIs(page, "/admin/people");
    });

    // Upstream calls H.activateToken("pro-self-hosted") in an otherwise
    // untagged test, so it is token-dependent all the same. Gate it, or a
    // token-less run FAILS here instead of skipping (found by the gate-OFF
    // control: activateToken throws on the missing env var).
    test("should not offer to reset passwords when password login is disabled", async ({
      page,
      mb,
    }) => {
      test.skip(
        !resolveToken("pro-self-hosted"),
        "requires the pro-self-hosted token",
      );
      await mb.api.activateToken("pro-self-hosted");
      await mb.api.put("/api/google/settings", {
        "google-auth-auto-create-accounts-domain": null,
        "google-auth-client-id": "example1.apps.googleusercontent.com",
        "google-auth-enabled": true,
      });

      await mb.api.put("/api/setting", { "enable-password-login": false });
      await page.goto("/admin/people");
      await showUserOptions(page, normalUserName);
      await expect(
        popover(page).getByText("Reset password", { exact: true }),
      ).toHaveCount(0);
    });

    // Upstream: { tags: "@external" } + H.setupSMTP(). See the header — this
    // asserts only email-configured-gated FE copy, so the settings write is
    // enough and no maildev container is needed.
    test("should reset user password with SMTP set up", async ({
      page,
      mb,
    }) => {
      await configureSmtpSettings(mb.api);

      await page.goto("/admin/people");
      await showUserOptions(page, normalUserName);
      await page.getByText("Reset password", { exact: true }).click();
      await expect(
        page.getByText(`Reset ${normalUserName}'s password?`, { exact: true }),
      ).toBeVisible();

      const dialog = modal(page);
      await expect(
        dialog.getByRole("button", { name: "Get reset link", exact: true }),
      ).toHaveCount(1);
      await dialog
        .getByRole("button", { name: "Reset password", exact: true })
        .click();

      await expect(
        undoToast(page)
          .getByText(`Password reset email sent to ${normalUserName}`, {
            exact: true,
          })
          .first(),
      ).toBeVisible();

      // cy.log("Should not show temporary password modal")
      await expect(
        page.getByText(`${normalUserName}'s password has been reset`, {
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(page.getByText(/^temporary password$/i)).toHaveCount(0);

      // cy.log("Should close the modal")
      await expect(dialog).toHaveCount(0);
    });

    test("should allow to search people", async ({ page }) => {
      await page.goto("/admin/people");

      const search = page.getByPlaceholder("Find someone", { exact: true });
      await search.click();
      await search.pressSequentially("no");
      await expect(
        page
          .getByTestId("people-list-footer")
          .getByText("6 people found", { exact: true }),
      ).toBeVisible();
      await assertTableRowsCount(page, 6);

      await search.pressSequentially("ne");
      await expect(
        page
          .getByTestId("people-list-footer")
          .getByText("1 person found", { exact: true }),
      ).toBeVisible();
      await assertTableRowsCount(page, 1);

      await search.clear();
      await expect(
        page
          .getByTestId("people-list-footer")
          .getByText(`${TOTAL_USERS} people found`, { exact: true }),
      ).toBeVisible();
      await assertTableRowsCount(page, TOTAL_USERS);
    });

    test("should allow group creation and deletion", async ({ page, mb }) => {
      // The Cypress original spells out 256 "a"s literally.
      const longGroupName = "a".repeat(256);

      await page.goto("/admin/people/groups");
      await page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === "/api/permissions/group",
      );
      await page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === "/api/api-key",
      );

      const adminPanel = page.getByTestId("admin-panel");

      const createGroup = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/permissions/group",
      );
      const groupsAfterCreate = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === "/api/permissions/group",
      );
      await clickButton(adminPanel, "Create a group");
      await adminPanel
        .getByPlaceholder(/something like/i)
        .fill("My New Group");
      await clickButton(adminPanel, "Add");
      await createGroup;
      await groupsAfterCreate;

      // cy.log("should show API errors from group endpoints (metabase#52886)")
      await clickButton(adminPanel, "Create a group");
      await adminPanel.getByPlaceholder(/something like/i).fill(longGroupName);
      await clickButton(adminPanel, "Add");

      await expect(page.getByTestId("alert-modal")).toHaveCount(1);
      await modal(page).getByText("Ok", { exact: true }).click();

      await icon(
        adminPanel
          .locator("tr")
          .filter({ has: page.getByText("My New Group", { exact: true }) }),
        "ellipsis",
      ).click();
      await popover(page).getByText("Edit Name", { exact: true }).click();
      // Scoped to the admin panel, never page-wide (PORTING: a page-wide
      // findByDisplayValue resolves an nth() index that goes stale).
      const nameInput = await findByDisplayValue(adminPanel, "My New Group");
      await nameInput.fill(longGroupName);
      await clickButton(adminPanel, "Done");

      await expect(page.getByTestId("alert-modal")).toHaveCount(1);
      await modal(page).getByText("Ok", { exact: true }).click();
      await adminPanel
        .getByRole("button", { name: "Cancel", exact: true })
        .click();

      const deleteGroup = page.waitForResponse(
        (response) =>
          response.request().method() === "DELETE" &&
          /^\/api\/permissions\/group\/[^/]+$/.test(
            new URL(response.url()).pathname,
          ),
      );
      const groupsAfterDelete = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === "/api/permissions/group",
      );
      await icon(
        adminPanel
          .locator("tr")
          .filter({ has: page.getByText("My New Group", { exact: true }) }),
        "ellipsis",
      ).click();
      await popover(page).getByText("Remove Group", { exact: true }).click();
      await clickButton(modal(page), "Remove group");

      await deleteGroup;
      await groupsAfterDelete;
      await expect(
        adminPanel.getByText("My New Group", { exact: true }),
      ).toHaveCount(0);
      void mb;
    });

    test("should display api keys included in a group and display a warning when deleting the group", async ({
      page,
      mb,
    }) => {
      await createApiKey(mb, "MyApiKey", COLLECTION_GROUP);

      await page.goto("/admin/people/groups");
      await page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === "/api/permissions/group",
      );
      await page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === "/api/api-key",
      );

      const adminPanel = page.getByTestId("admin-panel");
      const collectionRow = adminPanel
        .locator("tr")
        .filter({ has: page.getByText("collection", { exact: true }) });

      await expect(
        collectionRow.getByText("(includes 1 API key)", { exact: true }),
      ).toBeVisible();

      await icon(collectionRow, "ellipsis").click();

      await popover(page).getByText("Remove Group", { exact: true }).click();

      const dialog = modal(page);
      await expect(
        dialog.getByText(
          "Are you sure you want remove this group and its API key?",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", {
          name: "Remove group and API key",
          exact: true,
        }),
      ).toHaveCount(1);
    });

    test("should display more than 50 groups (metabase#17200)", async ({
      page,
      mb,
    }) => {
      await generateGroups(mb.api, 51);

      await page.goto("/admin/people/groups");
      const content = page.getByTestId("admin-layout-content");
      await expect(content).toBeVisible();
      await content.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(page.getByText("readonly", { exact: true })).toBeVisible();
    });

    // Upstream: describe("email configured", { tags: "@external" }). See the
    // header — configureSmtpSettings is enough, so this runs unconditionally.
    test.describe("email configured", () => {
      test.beforeEach(async ({ mb }) => {
        // Setup email server, since we show different modal message when
        // email isn't configured
        await configureSmtpSettings(mb.api);
        await setupGoogleAuth(mb.api);
      });

      test("invite member when SSO is not configured", async ({ page }) => {
        const { first_name, last_name, email } = TEST_USER;
        const FULL_NAME = `${first_name} ${last_name}`;
        await page.goto("/admin/people");

        await clickButton(page, "Invite someone");

        // first modal
        await page.getByLabel("First name", { exact: true }).fill(first_name);
        await page.getByLabel("Last name", { exact: true }).fill(last_name);
        await page.getByLabel(/Email/).fill(email);
        await clickButton(page, "Create");

        // second modal
        await expect(
          page.getByText(`${FULL_NAME} has been added`, { exact: true }),
        ).toBeVisible();
        // cy.contains(str): case-sensitive substring, first match. The copy
        // has an inline <strong> for the email, so match as a regex over the
        // container's full text.
        await expect(
          page
            .getByText(
              new RegExp(
                `We’ve sent an invite to ${email} with instructions to set their password\\.`,
              ),
            )
            .first(),
        ).toBeVisible();
        await page.getByText("Done", { exact: true }).click();

        await expect(page.getByText(FULL_NAME, { exact: true })).toBeVisible();
      });
    });

    test.describe("pagination", () => {
      const NEW_USERS = 18;
      const NEW_TOTAL_USERS = TOTAL_USERS + NEW_USERS;

      test.beforeEach(async ({ mb }) => {
        await generateUsers(mb.api, NEW_USERS);
      });

      test("should allow paginating people forward and backward", async ({
        page,
      }) => {
        const PAGE_SIZE = 25;

        const footer = page.getByTestId("people-list-footer");

        const users = page.waitForResponse(
          (response) =>
            response.request().method() === "GET" &&
            new URL(response.url()).pathname === "/api/user" &&
            new URL(response.url()).searchParams.has("query"),
        );
        await page.goto("/admin/people");
        await expect(
          page.getByTestId("admin-panel").getByText("Loading...", {
            exact: true,
          }),
        ).toHaveCount(0);
        await users;

        // cy.log("Page 1")
        await assertTableRowsCount(page, PAGE_SIZE);
        await footer.scrollIntoViewIfNeeded();
        await expect(footer).toBeVisible();
        await expect(footer).toContainText(`${NEW_TOTAL_USERS} people found`);
        await expect(footer).toContainText(`1 - ${PAGE_SIZE}`);

        await expect(
          footer.getByLabel("Previous page", { exact: true }),
        ).toBeDisabled();

        const page2 = page.waitForResponse(
          (response) =>
            response.request().method() === "GET" &&
            new URL(response.url()).pathname === "/api/user" &&
            new URL(response.url()).searchParams.has("query"),
        );
        await footer.getByLabel("Next page", { exact: true }).click();
        await page2;

        // cy.log("Page 2")
        await assertTableRowsCount(page, NEW_TOTAL_USERS % PAGE_SIZE);
        await footer.scrollIntoViewIfNeeded();
        await expect(footer).toContainText(
          `${PAGE_SIZE + 1} - ${NEW_TOTAL_USERS}`,
        );

        // cy.log("Back to the Page 1")
        await expect(
          footer.getByLabel("Next page", { exact: true }),
        ).toBeDisabled();
        await footer.getByLabel("Previous page", { exact: true }).click();

        await assertTableRowsCount(page, PAGE_SIZE);
        await footer.scrollIntoViewIfNeeded();
        await expect(footer).toContainText(`1 - ${PAGE_SIZE}`);
      });

      test("should allow paginating group members forward and backward", async ({
        page,
      }) => {
        const PAGE_SIZE = 25;
        await page.goto(`/admin/people/groups/${ALL_USERS_GROUP}`);

        // Total
        await expect(
          page.getByText(`${NEW_TOTAL_USERS} members`, { exact: true }),
        ).toBeVisible();

        // Page 1
        await expect(
          page.getByText(`1 - ${PAGE_SIZE}`, { exact: true }),
        ).toBeVisible();
        await assertTableRowsCount(page, PAGE_SIZE);
        await expect(
          page.getByLabel("Previous page", { exact: true }),
        ).toBeDisabled();

        await page.getByLabel("Next page", { exact: true }).click();
        await expect(
          page.getByText("Loading...", { exact: true }),
        ).toHaveCount(0);

        // Page 2
        await expect(
          page.getByText(`${PAGE_SIZE + 1} - ${NEW_TOTAL_USERS}`, {
            exact: true,
          }),
        ).toBeVisible();
        await assertTableRowsCount(page, NEW_TOTAL_USERS % PAGE_SIZE);
        await expect(
          page.getByLabel("Next page", { exact: true }),
        ).toBeDisabled();

        await page.getByLabel("Previous page", { exact: true }).click();
        await expect(
          page.getByText("Loading...", { exact: true }),
        ).toHaveCount(0);

        // Page 1
        await expect(
          page.getByText(`1 - ${PAGE_SIZE}`, { exact: true }),
        ).toBeVisible();
        await assertTableRowsCount(page, PAGE_SIZE);
      });
    });
  });
});

test.describe("scenarios > admin > people (EE)", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "requires the pro-self-hosted token",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should unsubscribe a user from all subscriptions and alerts", async ({
    page,
    mb,
  }) => {
    const user_id = await getCurrentUserId(mb.api);
    const { card_id, dashboard_id } = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        name: "Question",
        query: { "source-table": ORDERS_ID },
      },
    });
    await createQuestionAlert(mb.api, { user_id, card_id });
    await createPulse(mb.api, {
      name: "Dashboard",
      dashboard_id,
      cards: [{ id: card_id, include_csv: false, include_xls: false }],
      channels: [
        { enabled: true, channel_type: "slack", schedule_type: "hourly" },
      ],
    });

    await page.goto("/account/notifications");
    await expect(page.getByText("Question", { exact: true })).toBeVisible();
    await expect(page.getByText("Dashboard", { exact: true })).toBeVisible();

    await page.goto("/admin/people");
    await showUserOptions(page, adminUserName);

    await popover(page)
      .getByText("Unsubscribe from all subscriptions / alerts", {
        exact: true,
      })
      .click();

    const dialog = modal(page);
    await expect(
      dialog.getByText(adminUserName).first(),
    ).toBeVisible();
    await dialog.getByText("Unsubscribe", { exact: true }).click();
    await expect(
      dialog.getByText("Unsubscribe", { exact: true }),
    ).toHaveCount(0);

    await page.goto("/account/notifications");
    // ⚠️ These three assertions are VACUOUS — upstream too, and ported verbatim
    // rather than silently strengthened (see the findings note).
    //
    // Measured by mutation: replacing the "Unsubscribe" click above with an
    // Escape (i.e. never unsubscribing at all) leaves this test GREEN. The
    // intended anchor is itself part of the loading state — `NotificationList`
    // renders `NotificationEmptyState` (the only source of the "bell icon")
    // whenever `items.length === 0`, which includes the pre-fetch window. On
    // this backend the bell paints at **+68ms** and the "Question" card at
    // **+134ms**, so both the bell assertion and the two absence checks are
    // satisfied inside that 66ms gap. Cypress's `should("not.exist")` has the
    // same first-absent-observation semantics, so this is an upstream hole,
    // not port drift (PORTING: "absence assertions are vacuous inside a
    // mount-lag window — the fix is an ANCHOR").
    await expect(page.getByLabel("bell icon", { exact: true })).toBeVisible();
    await expect(page.getByText("Question", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Dashboard", { exact: true })).toHaveCount(0);
  });

  test("invite member when SSO is configured metabase#23630", async ({
    page,
    mb,
  }) => {
    // Upstream H.setupSMTP(); see the header — settings-only is sufficient.
    await configureSmtpSettings(mb.api);
    await setupGoogleAuth(mb.api);
    await mb.api.put("/api/setting", { "enable-password-login": false });

    const { first_name, last_name, email } = TEST_USER;
    const FULL_NAME = `${first_name} ${last_name}`;

    await page.goto("/admin/people");
    await clickButton(page, "Invite someone");

    // first modal
    await page.getByLabel("First name", { exact: true }).fill(first_name);
    await page.getByLabel("Last name", { exact: true }).fill(last_name);
    await page.getByLabel(/Email/).fill(email);
    await clickButton(page, "Create");

    // second modal
    const dialog = modal(page);
    await expect(
      dialog.getByText(`${FULL_NAME} has been added`, { exact: true }),
    ).toBeVisible();
    await expect(
      dialog
        .getByText(
          new RegExp(
            `We’ve sent an invite to ${email} with instructions to log in\\. ` +
              `If this user is unable to authenticate then you can reset their password\\.`,
          ),
        )
        .first(),
    ).toBeVisible();
    const match = /\/admin\/people\/(?<userId>\d+)\/success/.exec(page.url());
    expect(match, `no /admin/people/:id/success in ${page.url()}`).not.toBeNull();
    const userId = match!.groups!.userId;
    await assertLinkMatchesUrl(
      dialog,
      "reset their password.",
      `/admin/people/${userId}/reset`,
    );
    await dialog
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await expect(page.getByTestId("admin-people-list-table")).toContainText(
      FULL_NAME,
    );
  });
});

test.describe("scenarios > admin > people > group managers", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "requires the pro-self-hosted token",
  );

  async function removeFirstGroup(page: import("@playwright/test").Page) {
    await icon(page, "ellipsis").nth(0).click();
    await page.getByText("Remove Group", { exact: true }).click();
    await clickButton(modal(page), "Remove group");
  }

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    await page.goto("/admin/people");
    await userRow(page, normalUserName)
      .getByText("2 other groups", { exact: true })
      .click();

    // cy.findAllByTestId("user-type-toggle").click({ multiple: true }) —
    // the two toggles are the `collection` and `data` rows of the membership
    // popover. Each click fires a membership PUT and re-renders the list, so
    // anchor on the responses rather than firing them back-to-back.
    const toggles = page.getByTestId("user-type-toggle");
    await expect(toggles).toHaveCount(2);
    for (let index = 0; index < 2; index++) {
      const updated = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname.startsWith(
            "/api/permissions/membership/",
          ),
      );
      await toggles.nth(index).click();
      await updated;
    }

    await mb.signInAsNormalUser();
    await page.goto("/");
    await goToAdmin(page);
  });

  test.describe("group managers", () => {
    test("can manage groups from the group page", async ({ page }) => {
      const sidebar = page.getByTestId("admin-layout-sidebar");
      await expect(sidebar.getByText("Groups", { exact: true })).toBeVisible();
      await sidebar.getByText("Groups", { exact: true }).click();

      // Edit group name
      await icon(page, "ellipsis").nth(0).click();
      await page.getByText("Edit Name", { exact: true }).click();
      const nameInput = await findByDisplayValue(
        page.getByTestId("admin-panel"),
        "collection",
      );
      // cy.type() appends to the existing value; press End first so the
      // caret is at the end (PORTING: .type()'s caret is not implicitly at
      // the end in a Playwright port).
      await nameInput.click();
      await nameInput.press("End");
      await nameInput.pressSequentially(" updated");
      await clickButton(page, "Done");

      // Click on the group with the new name
      await page.getByText("collection updated", { exact: true }).click();

      // Add "No Collection" user as a member
      await clickButton(page, "Add members");
      const memberInput = page.getByLabel("Search for a user to add", {
        exact: true,
      });
      await expect(memberInput).toBeFocused();
      await memberInput.pressSequentially("No");
      await page.getByText(noCollectionUserName, { exact: true }).click();
      await memberInput.blur();
      await page.getByText("Add", { exact: true }).click();

      // Find user row
      const row = userRow(page, noCollectionUserName);
      await expect(row).toHaveCount(1);

      // Promote to manager and demote back to member
      await toggleUserTypeInRow(row, "Member");
      await toggleUserTypeInRow(row, "Manager");
      await expect(row.getByText("Member", { exact: true })).toBeVisible();

      // Delete the user
      await icon(row, "close").click();
      await expect(
        page.getByText(noCollectionUserName, { exact: true }),
      ).toHaveCount(0);

      // Demote myself
      await toggleUserTypeInRow(userRow(page, normalUserName), "Manager");
      await confirmLosingAbilityToManageGroup(modal(page));

      // Redirected to the groups list
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toMatch(/\/admin\/people\/groups$/);

      // Open another group
      await page.getByText("data", { exact: true }).click();

      // Remove myself
      await icon(userRow(page, normalUserName), "close").click();
      await confirmLosingAbilityToManageGroup(modal(page));

      // Redirected to the home page
      await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/$/);
    });

    test("can manage members from the people page", async ({ page }) => {
      // Open membership select for a user
      const row = userRow(page, noCollectionUserName);
      await row.getByText("data", { exact: true }).click();

      // Add the user to a group
      await popover(page).getByText("collection", { exact: true }).click();
      await expect(
        row.getByText("2 other groups", { exact: true }),
      ).toBeVisible();

      // Remove the user from the group
      await popover(page).getByText("collection", { exact: true }).click();
      await expect(row.getByText("data", { exact: true })).toBeVisible();

      // Promote and then demote the user
      await icon(popover(page), "arrow_up").click();
      await icon(popover(page), "arrow_down").click();

      // Find own row
      await userRow(page, normalUserName)
        .getByText("2 other groups", { exact: true })
        .click();

      // Demote myself from being manager
      await popover(page).getByLabel("collection", { exact: true }).click();
      await confirmLosingAbilityToManageGroup(modal(page));
      await expect(
        popover(page).getByLabel("collection", { exact: true }),
      ).toHaveCount(0);

      // Remove myself from another group
      await popover(page).getByLabel("data", { exact: true }).click();
      await confirmLosingAbilityToManageGroup(modal(page));

      // Redirected to the home page
      await expect.poll(() => new URL(page.url()).pathname).toBe("/");
    });
  });

  test("after removing the last group redirects to the home page", async ({
    page,
  }) => {
    await page
      .getByTestId("admin-layout-sidebar")
      .getByText("Groups", { exact: true })
      .click();

    await removeFirstGroup(page);
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toMatch(/\/admin\/people\/groups$/);

    await removeFirstGroup(page);
    await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/$/);
  });
});

/**
 * Upstream's beforeEach opens with `cy.skipOn(true)` and a
 * "TODO: remove the next line when this issue gets fixed" comment, so this
 * describe has never executed. Ported and skipped so the skip stays honest
 * about what it covers rather than silently dropping the case.
 */
test.describe.skip("issue 23689", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    await page.goto(`/admin/people/groups/${COLLECTION_GROUP}`);

    await expect(page.getByText("3 members", { exact: true })).toBeVisible();

    await expect(
      page.getByText(getFullName(ALL_USERS.normal), { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(getFullName(ALL_USERS.nodata), { exact: true }),
    ).toBeVisible();

    // Make sandboxed user a group manager
    await userRow(page, getFullName(ALL_USERS.sandboxed))
      .getByTestId("user-type-toggle")
      .dispatchEvent("click");

    // Sanity check instead of waiting for the PUT request
    await expect(page.getByText("Manager", { exact: true })).toBeVisible();

    await mb.api.post("/api/mt/gtap", {
      table_id: SAMPLE_DATABASE.ORDERS_ID,
      group_id: COLLECTION_GROUP,
      attribute_remappings: {
        attr_uid: ["dimension", ["field", SAMPLE_DATABASE.ORDERS.USER_ID, null]],
      },
      card_id: null,
    });

    await mb.signOut();
    await mb.signInAsSandboxedUser();
  });

  test("sandboxed group manager should see all other members (metabase#23689)", async ({
    page,
  }) => {
    await page.goto(`/admin/people/groups/${COLLECTION_GROUP}`);

    await expect(page.getByText("3 members", { exact: true })).toBeVisible();

    for (const user of [
      ALL_USERS.sandboxed,
      ALL_USERS.normal,
      ALL_USERS.nodata,
    ]) {
      await expect(
        page.getByText(getFullName(user), { exact: true }),
      ).toBeVisible();
    }

    await page.goto("/admin/people");

    await expect(
      page.getByText(`${TOTAL_USERS} people found`, { exact: true }),
    ).toBeVisible();
    for (const user of [
      ALL_USERS.sandboxed,
      ALL_USERS.normal,
      ALL_USERS.nodata,
      ALL_USERS.nocollection,
    ]) {
      await expect(
        page.getByText(getFullName(user), { exact: true }),
      ).toBeVisible();
    }
  });
});

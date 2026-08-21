/**
 * Playwright port of e2e/test/scenarios/admin-2/tenants.cy.spec.ts
 *
 * Multi-tenancy admin: enabling the feature, creating/editing/deactivating
 * tenants, creating tenant users and tenant groups, the tenant-vs-internal
 * permission surfaces (globe icons, restricted columns, warning tooltips and
 * modals), tenant-attribute propagation, and JWT provisioning of tenant users
 * with sandboxing.
 *
 * ── Infra tier ───────────────────────────────────────────────────────────
 * Mixed, and NOT the "@external ⇒ QA database" the classifier suggests:
 *  - 10 of the 12 tests need NO container at all (default snapshot + EE token).
 *  - 1 test (`should not show send email modal …`) calls `H.setupSMTP()`, which
 *    PUTs /api/email and live-validates the connection → needs **maildev**
 *    (gated on `isMaildevRunning()`).
 *  - 1 test (`should show tenant attributes in user attribute lists …`) restores
 *    the `postgres-writable` snapshot and drives WRITABLE_DB_ID → needs the
 *    **writable QA postgres** (gated on `PW_QA_DB_ENABLED`).
 *
 * ── Port notes ───────────────────────────────────────────────────────────
 * - EE token gate (rule 7): `mb.api.activateToken("pro-self-hosted")` in the
 *   beforeEach, `test.skip(!resolveToken(...))` on the EE describes. The gate is
 *   REAL here — see findings-inbox/tenants.md for the measured probe.
 * - The `@OSS` describe is gated on `isOssBackend` (the spike backend is EE).
 *   Note the "EE jar with no token is not an OSS build" caveat: this test only
 *   asserts the *absence* of the tenants route + gear link, both of which are
 *   token-feature gated rather than `PLUGIN_IS_EE_BUILD` gated, so it reads
 *   correctly on an unlicensed EE jar too — but it is skipped here regardless,
 *   faithfully mirroring upstream's `@OSS` tag.
 * - `cy.task("signJwt")` → the local HS256 `signJwt` (support/tenants.ts) with
 *   an explicit `iat`. The `/auth/sso` redirect is the app's own, so FINDINGS
 *   #33 does not apply and `page.goto` follows it natively.
 * - `cy.intercept(...).as("getTenant"/"getUser")` are awaited exactly once
 *   (`cy.wait(["@getUser", "@getTenant"])`); registered before the triggering
 *   click per rule 2. The other beforeEach aliases are never awaited → dropped.
 * - `findByText`/`findByRole(name: string)` → `{ exact: true }` (rule 1);
 *   `cy.contains(str)` → case-sensitive substring regex.
 * - `cy.findAllByRole("row").contains("tr", x)` → `rowContaining` (first row
 *   whose text contains `x`, case-sensitively) — Cypress's `.contains` is
 *   first-match.
 * - Row ellipsis buttons are NOT hover-gated in these admin tables (they are
 *   rendered unconditionally), verified against the running app.
 * - `cy.location("pathname").should("eq", …)` retries → `expect.poll`.
 * - Two upstream calls pass bogus options that testing-library discards, and
 *   are ported as the plain query with the argument dropped (documented inline):
 *   `cy.findByTestId("admin-pane-page-title", { name: GROUP_NAME })` and
 *   `cy.findByText("Tenant users", 1000)`.
 */
import { resolveToken } from "../support/api";
import { isOssBackend } from "../support/admin";
import { isMaildevRunning, setupSMTP } from "../support/onboarding-extras";
import { sandboxTable } from "../support/dashboard-repros";
import { createNativeQuestion } from "../support/factories";
import type { Page } from "@playwright/test";

import { test, expect } from "../support/fixtures";
import { getPermissionRowPermissions } from "../support/create-queries";
import { findByDisplayValue } from "../support/filters-repros";
import { tooltip } from "../support/charts";
import { undoToastList } from "../support/organization";
import { modal, navigationSidebar, openNavigationSidebar, popover } from "../support/ui";
import {
  ALL_EXTERNAL_USERS_GROUP_ID,
  COLLECTION_GROUP_ID,
  DOOHICKEY_USER,
  GIZMO_FULL_NAME,
  GIZMO_TENANT,
  GIZMO_USER,
  STATIC_ORDERS_ID,
  STATIC_PRODUCTS_ID,
  USERS,
  adminContentTable,
  adminLayoutContent,
  adminPeopleListTable,
  assertPermissionTableColumnsExist,
  createTenantGroupFromUI,
  createTenants,
  typeTenantName,
  visitTenantUsers,
  createUsers,
  expectGlobeIcon,
  expectNoGlobeIcon,
  loginWithJwt,
  peopleNav,
  provisionViaJwt,
  rowContaining,
} from "../support/tenants";

/** Mirrors WRITABLE_DB_ID (e2e/support/cypress_data.js). */
const WRITABLE_DB_ID = 2;

/**
 * `cy.get("[data-column-id=CATEGORY]")` resolves to one gridcell per row, and
 * chai-jquery's `contain.text` reads `$el.text()` across the whole set. Join
 * every match's text so the assertion has the same meaning.
 */
async function categoryColumnText(page: Page): Promise<string> {
  const cells = page.locator("[data-column-id=CATEGORY]");
  await expect(cells.first()).toBeVisible();
  return (await cells.allInnerTexts()).join("");
}

/**
 * Port of `cy.findByRole("switch", { name }).click({ force: true })` on the
 * database-detail page. `useAdminSetting`'s isLoading keeps these disabled
 * briefly, and a force-click on a disabled input silently no-ops (PORTING) —
 * measured here as the routed-attribute picker never rendering. Assert the
 * switch is enabled, click, then assert it actually flipped.
 */
async function toggleDatabaseSwitch(page: Page, name: RegExp): Promise<void> {
  const control = page.getByRole("switch", { name });
  await expect(control).toBeEnabled();
  const before = await control.isChecked();
  await control.click({ force: true });
  await expect(control).toBeChecked({ checked: !before });
}

test.describe("Tenants - management OSS", () => {
  test.beforeEach(async ({ mb }) => {
    test.skip(
      !(await isOssBackend(mb.api)),
      "@OSS — the spike backend is an EE build",
    );
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not show the popup to enable multi tenancy", async ({ page }) => {
    await page.goto("/admin/people/tenants");
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe("/admin/people");

    await expect(page.getByRole("link", { name: /gear/ })).toHaveCount(0);
  });
});

test.describe("Tenants - management", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "tenants are an EE feature — requires the pro-self-hosted token",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should disable the feature if the token feature is not enabled", async ({
    page,
    mb,
  }) => {
    // H.deleteToken()
    await mb.api.put("/api/setting/premium-embedding-token", { value: null });

    await page.goto("/admin/people/tenants");
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe("/admin/people");

    await expect(page.getByRole("link", { name: /gear/ })).toHaveCount(0);
  });

  test("should allow users to enable multi tenancy, and create / manage tenants and tenant users", async ({
    page,
  }) => {
    // We expect this to redirect to /admin/people
    await page.goto("/admin/people/tenants");
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe("/admin/people");

    await page.goto("/admin/people/tenants");

    await peopleNav(page).getByRole("link", { name: /Groups/ }).click();

    await expect(
      adminContentTable(page).getByRole("link", { name: /All Users/ }),
    ).toHaveCount(1);
    await expect(
      adminContentTable(page).getByRole("link", { name: /Tenant users/ }),
    ).toHaveCount(0);

    await peopleNav(page).getByRole("link", { name: /People/ }).click();

    await expect(
      page.getByRole("link", { name: /Tenant users/ }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Tenants/ })).toHaveCount(0);

    await page.getByRole("link", { name: /gear/ }).click();

    await modal(page).getByRole("radio", { name: /Multi tenant/i }).click();
    await modal(page).getByRole("button", { name: "Apply", exact: true }).click();

    await expect(page.getByRole("link", { name: /Tenant users/ })).toHaveCount(1);
    await expect(page.getByRole("link", { name: /Tenants/ })).toHaveCount(1);

    // after enabling multi-tenancy, it takes you to the tenants page
    await expect(
      adminLayoutContent(page).getByText("Tenants", { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      adminLayoutContent(page).getByText(/Create your first tenant to start adding/),
    ).toBeVisible();

    // Onboarding: create the first tenant
    const createFirst = page.getByRole("button", {
      name: "Create your first tenant",
      exact: true,
    });
    await expect(createFirst).toBeVisible();
    await createFirst.click();

    await expect(
      modal(page).getByText("Set up your first tenant", { exact: true }),
    ).toBeVisible();
    await typeTenantName(page, "Parrot");

    // slug should be pre-filled
    await expect(
      modal(page).getByRole("textbox", {
        name: "Slug for this tenant",
        exact: true,
      }),
    ).toHaveValue("parrot");

    await modal(page)
      .getByRole("button", { name: "Create tenant", exact: true })
      .click();

    // Transient toast: assert the first match (PORTING toast/tooltip rule).
    await expect(
      undoToastList(page).filter({ hasText: /Tenant creation successful/ }).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "New tenant", exact: true }).click();
    await typeTenantName(page, "Eagle");
    await modal(page)
      .getByRole("button", { name: "Create tenant", exact: true })
      .click();

    await expect(
      undoToastList(page).filter({ hasText: /Tenant creation successful/ }).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "New tenant", exact: true }).click();
    await typeTenantName(page, "Turkey");
    await modal(page)
      .getByRole("button", { name: "Create tenant", exact: true })
      .click();

    await expect(
      adminContentTable(page).getByRole("link", { name: /Parrot/ }),
    ).toHaveCount(1);
    await expect(
      adminContentTable(page).getByRole("link", { name: /Eagle/ }),
    ).toHaveCount(1);
    await expect(
      adminContentTable(page).getByRole("link", { name: /Turkey/ }),
    ).toHaveCount(1);

    // Edit a tenant
    await adminContentTable(page)
      .getByRole("button", { name: /ellipsis/ })
      .nth(2)
      .click();

    await popover(page).getByText("Edit tenant", { exact: true }).click();

    const nameField = modal(page).getByRole("textbox", {
      name: "Give this tenant a name",
      exact: true,
    });
    await expect(nameField).toHaveValue("Turkey");
    // .clear().type("Chicken") — real keystrokes (rule 5): the form's onChange
    // derives the slug per keystroke and gates the submit button on `dirty`.
    await nameField.click();
    await nameField.press("ControlOrMeta+a");
    await nameField.press("Backspace");
    await nameField.pressSequentially("Chicken");

    const slugField = modal(page).getByRole("textbox", {
      name: "Slug for this tenant",
      exact: true,
    });
    await expect(slugField).toHaveValue("turkey");
    await expect(slugField).toBeDisabled();

    await modal(page).getByRole("button", { name: "Update", exact: true }).click();

    await expect(
      adminContentTable(page).getByRole("link", { name: /Parrot/ }),
    ).toHaveCount(1);
    await expect(
      adminContentTable(page).getByRole("link", { name: /Eagle/ }),
    ).toHaveCount(1);
    await expect(
      adminContentTable(page).getByRole("link", { name: /Chicken/ }),
    ).toHaveCount(1);

    // Deactivate a tenant
    await adminContentTable(page)
      .getByRole("button", { name: /ellipsis/ })
      .nth(1)
      .click();

    await popover(page).getByText("Deactivate tenant", { exact: true }).click();
    await modal(page)
      .getByRole("button", { name: "Deactivate", exact: true })
      .click();

    await expect(
      adminContentTable(page).getByRole("link", { name: /Parrot/ }),
    ).toHaveCount(1);
    await expect(
      adminContentTable(page).getByRole("link", { name: /Chicken/ }),
    ).toHaveCount(1);
    await expect(
      adminContentTable(page).getByRole("link", { name: /Eagle/ }),
    ).toHaveCount(0);

    await page.getByRole("tab", { name: "Deactivated", exact: true }).click();

    await expect(
      adminContentTable(page).getByRole("link", { name: /Parrot/ }),
    ).toHaveCount(0);
    await expect(
      adminContentTable(page).getByRole("link", { name: /Chicken/ }),
    ).toHaveCount(0);
    await expect(
      adminContentTable(page).getByRole("link", { name: /Eagle/ }),
    ).toHaveCount(1);

    // Create an external user
    await page.getByRole("link", { name: /Tenant users/ }).click();
    await page
      .getByRole("button", { name: "Create tenant user", exact: true })
      .click();

    await modal(page)
      .getByRole("textbox", { name: "First name", exact: true })
      .fill("Test");
    await modal(page)
      .getByRole("textbox", { name: "Last name", exact: true })
      .fill("User");
    await modal(page)
      .getByRole("textbox", { name: "Email", exact: true })
      .fill("test.user@email.com");
    await expect(
      modal(page).getByRole("generic", { name: "Groups", exact: true }),
    ).toHaveCount(0);
    await modal(page)
      .getByRole("textbox", { name: "Tenant", exact: true })
      .click();

    await expect(
      popover(page).getByText("Eagle", { exact: true }),
    ).toHaveCount(0);
    await popover(page).getByText("Parrot", { exact: true }).click();

    await modal(page).getByText("Attributes", { exact: true }).click();

    const mappingEditor = modal(page).getByTestId("mapping-editor");
    await expect(
      mappingEditor.getByText("@tenant.slug", { exact: true }),
    ).toHaveCount(1);
    // cy.findByDisplayValue("parrot").should("exist") — the tenant-slug
    // attribute's value control. findByDisplayValue matches input/textarea/
    // select, so use the shared imperative scan (getByDisplayValue is missing
    // from this Playwright install's types).
    await findByDisplayValue(mappingEditor, "parrot");

    await mappingEditor
      .getByRole("button", { name: /Add an attribute/i })
      .click();

    const keyInput = mappingEditor.getByPlaceholder("Key", { exact: true });
    await keyInput.fill("@tenant.name");

    await expect(
      mappingEditor.getByText(
        'Keys starting with "@" are reserved for system use',
        { exact: true },
      ),
    ).toHaveCount(1);

    await keyInput.fill("");
    await keyInput.fill("my-special-attr");

    const valueInputs = mappingEditor.getByPlaceholder("Value", { exact: true });
    await expect(valueInputs).toHaveCount(2);
    await valueInputs.last().fill("Snowflake");

    await modal(page).getByRole("button", { name: "Create", exact: true }).click();

    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(adminPeopleListTable(page)).toContainText("Parrot");

    // Reactivate tenant
    await page.getByRole("link", { name: /Tenants/ }).click();
    await expect(adminContentTable(page)).toContainText("1");

    await page.getByRole("tab", { name: "Deactivated", exact: true }).click();
    await adminContentTable(page)
      .getByRole("button", { name: /ellipsis/ })
      .click();
    await popover(page).getByText("Reactivate tenant", { exact: true }).click();
    await modal(page)
      .getByRole("button", { name: "Reactivate", exact: true })
      .click();

    // after reactivating the last deactivated tenant, tabs should disappear
    // and show all active tenants
    await expect(
      page.getByRole("tab", { name: "Deactivated", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /Active/ })).toHaveCount(0);

    await expect(
      adminContentTable(page).getByRole("link", { name: /Parrot/ }),
    ).toHaveCount(1);
    await expect(
      adminContentTable(page).getByRole("link", { name: /Eagle/ }),
    ).toHaveCount(1);

    await peopleNav(page)
      .getByRole("link", { name: /Internal groups/ })
      .click();

    await expect(
      adminContentTable(page).getByRole("link", { name: /All internal users/ }),
    ).toBeVisible();
    await expect(
      adminContentTable(page).getByRole("link", { name: /All tenant users/ }),
    ).toHaveCount(0);

    await peopleNav(page)
      .getByRole("link", { name: /Tenant groups/ })
      .first()
      .click();

    await expect(
      adminContentTable(page).getByRole("link", { name: /All internal users/ }),
    ).toHaveCount(0);

    const externalGroupRow = adminContentTable(page).getByRole("row", {
      name: `group-${ALL_EXTERNAL_USERS_GROUP_ID}-row`,
      exact: true,
    });
    await expect(
      externalGroupRow.getByRole("cell", { name: "member-count", exact: true }),
    ).toContainText("1");
    await expect(
      externalGroupRow.getByRole("button", {
        name: "group-action-button",
        exact: true,
      }),
    ).toHaveCount(0);
    await externalGroupRow
      .getByRole("link", { name: /All tenant users/ })
      .click();

    await expect(
      page
        .getByTestId("admin-panel")
        .getByText(/All tenant users group and can't be removed from it/),
    ).toHaveCount(1);
  });

  test("should allow you to manage external user permissions once multi tenancy is enabled", async ({
    page,
    mb,
  }) => {
    const EXTERNAL_USER_GROUP_NAME = "All tenant users";
    const TENANT_GROUP_NAME = "Favorite tenant users";

    await mb.api.post("/api/permissions/group", {
      name: TENANT_GROUP_NAME,
      is_tenant_group: true,
    });

    await page.goto("/admin/permissions");
    await expect(
      page.getByRole("menuitem", { name: "Administrators", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", {
        name: EXTERNAL_USER_GROUP_NAME,
        exact: true,
      }),
    ).toHaveCount(0);

    await mb.api.put("/api/setting", { "use-tenants": true });

    await page.reload();
    await expect(
      page.getByRole("menuitem", { name: "Administrators", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: TENANT_GROUP_NAME, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("menuitem", { name: EXTERNAL_USER_GROUP_NAME, exact: true })
      .click();

    await assertPermissionTableColumnsExist(page, [
      "exist",
      "exist",
      "exist",
      "not.exist",
      "not.exist",
    ]);

    await page
      .getByRole("menuitem", { name: "Administrators", exact: true })
      .click();

    await assertPermissionTableColumnsExist(page, [
      "exist",
      "exist",
      "exist",
      "exist",
      "exist",
    ]);

    // The Databases tab is force-clicked upstream; the tab is inside a
    // Mantine SegmentedControl-like tablist. Keep force parity.
    await page
      .getByRole("tab", { name: "Databases", exact: true })
      .click({ force: true });
    await page
      .getByRole("menuitem", { name: "Sample Database", exact: true })
      .click();

    await assertPermissionTableColumnsExist(page, [
      "exist",
      "exist",
      "exist",
      "exist",
      "exist",
    ]);

    await expect(
      getPermissionRowPermissions(page, "All tenant users").nth(3),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(
      getPermissionRowPermissions(page, "All tenant users").nth(4),
    ).toHaveAttribute("aria-disabled", "true");

    await expectGlobeIcon(page, EXTERNAL_USER_GROUP_NAME);
    await expectGlobeIcon(page, TENANT_GROUP_NAME);
    await expectNoGlobeIcon(page, "Administrators");
    await expectNoGlobeIcon(page, "All internal users");
  });

  test("should show 'All tenant users' in permission warning tooltip for tenant groups (UXW-2474)", async ({
    page,
    mb,
  }) => {
    await mb.api.put("/api/setting", { "use-tenants": true });

    // Create a tenant group
    const group = (await (
      await mb.api.post("/api/permissions/group", {
        name: "Test Tenant Group",
        is_tenant_group: true,
      })
    ).json()) as { id: number };

    await page.goto(`/admin/permissions/data/group/${group.id}`);

    await page
      .getByRole("tab", { name: "Groups", exact: true })
      .click({ force: true });

    await page
      .getByRole("menuitem", { name: "All tenant users", exact: true })
      .click();

    // sample database's view data permission should be 'Can view'
    await expect(
      getPermissionRowPermissions(page, "Sample Database").first(),
    ).toContainText("Can view");

    await page
      .getByRole("menuitem", { name: "Test Tenant Group", exact: true })
      .click();

    // tenant group view data permission should be 'Blocked'
    await expect(
      getPermissionRowPermissions(page, "Sample Database").first(),
    ).toContainText("Blocked");

    // tenant group permission should contain a warning
    await getPermissionRowPermissions(page, "Sample Database")
      .first()
      .getByLabel("warning icon", { exact: true })
      .hover();

    // Tooltip must reference "All tenant users" not "All internal users"
    await expect(tooltip(page).first()).toContainText(
      'The "All tenant users" group has a higher level of access',
    );
    await expect(tooltip(page).first()).not.toContainText("All internal users");
  });

  test("should show 'All internal users' in permission warning modal for internal groups on tenant collections (EMB-1143)", async ({
    page,
    mb,
  }) => {
    await mb.api.put("/api/setting", { "use-tenants": true });

    await mb.api.post("/api/permissions/group", {
      name: "Test Internal Group",
      is_tenant_group: false,
    });

    await page.goto("/admin/permissions/tenant-collections/root");

    // all internal users should have 'View' access
    await expect(
      rowContaining(page, "All internal users").getByText("View", {
        exact: true,
      }),
    ).toBeVisible();

    // internal group should have no access
    await rowContaining(page, "Test Internal Group")
      .getByText("No access", { exact: true })
      .click();

    // change internal group to view-only
    await popover(page).getByText("View", { exact: true }).click();

    await rowContaining(page, "Test Internal Group")
      .getByText("View", { exact: true })
      .click();

    // change internal group back to no access
    await popover(page).getByText("No access", { exact: true }).click();

    // title should mention internal users group
    await expect(
      modal(page).getByText(/Revoke access even though "All internal users"/),
    ).toBeVisible();

    // description should mention internal users group
    await expect(
      modal(page).getByText(
        /The "All internal users" group has a higher level of access/,
      ),
    ).toBeVisible();

    // should not mention tenant users
    // cy.contains("Tenant users") is a case-sensitive substring match.
    await expect(modal(page).getByText(/Tenant users/)).toHaveCount(0);
  });

  test("should show 'All tenant users' in permission warning tooltip and modal for tenant groups on data permissions (UXW-2624)", async ({
    page,
    mb,
  }) => {
    await mb.api.put("/api/setting", { "use-tenants": true });

    await mb.api.post("/api/permissions/group", {
      name: "Test Tenant Group",
      is_tenant_group: true,
    });

    await page.goto("/admin/permissions/data/database/1");

    // all tenant users should have 'Can view' access
    await expect(rowContaining(page, "All tenant users")).toContainText(
      "Can view",
    );

    // tenant group should have 'Blocked' access (new group default) with
    // warning icon
    const tenantGroupRow = rowContaining(page, "Test Tenant Group");
    await expect(tenantGroupRow).toContainText("Blocked");
    await tenantGroupRow
      .getByLabel("warning icon", { exact: true })
      .first()
      .hover();

    // tooltip should reference 'All tenant users'
    await expect(tooltip(page).first()).toContainText(
      'The "All tenant users" group has a higher level of access',
    );

    // click to change to 'Can view' and back to trigger modal
    await rowContaining(page, "Test Tenant Group")
      .getByText("Blocked", { exact: true })
      .click();

    await popover(page).getByText("Can view", { exact: true }).click();

    await rowContaining(page, "Test Tenant Group")
      .getByText("Can view", { exact: true })
      .click();

    await popover(page).getByText("Blocked", { exact: true }).click();

    // title should mention tenant users group
    await expect(
      modal(page).getByText(/Revoke access even though "All tenant users"/),
    ).toBeVisible();

    // description should mention tenant users group
    await expect(
      modal(page).getByText(
        /The "All tenant users" group has a higher level of access/,
      ),
    ).toBeVisible();

    // should not mention internal users
    await expect(modal(page).getByText(/internal users/)).toHaveCount(0);
  });

  test("should not show send email modal when creating tenant users when SMTP is configured", async ({
    page,
    mb,
  }) => {
    test.skip(
      !(await isMaildevRunning()),
      "H.setupSMTP PUTs /api/email, which live-validates the SMTP connection — requires the maildev container",
    );

    await setupSMTP(mb.api);
    await mb.api.put("/api/setting", { "use-tenants": true });

    await createTenants(mb.api);

    await visitTenantUsers(page);

    await page.getByRole("link", { name: /Tenant users/ }).click();
    await page
      .getByRole("button", { name: "Create tenant user", exact: true })
      .click();

    await modal(page)
      .getByRole("textbox", { name: "First name", exact: true })
      .fill("Test");
    await modal(page)
      .getByRole("textbox", { name: "Last name", exact: true })
      .fill("User");
    await modal(page)
      .getByRole("textbox", { name: "Email", exact: true })
      .fill("test.user@email.com");
    await expect(
      modal(page).getByRole("generic", { name: "Groups", exact: true }),
    ).toHaveCount(0);
    await modal(page)
      .getByRole("textbox", { name: "Tenant", exact: true })
      .click();

    await popover(page).getByText("Gizmos", { exact: true }).click();

    await modal(page).getByRole("button", { name: "Create", exact: true }).click();

    await expect(modal(page)).toHaveCount(0);
  });

  test("should show tenant attributes in user attribute lists when multi tenancy is enabled", async ({
    page,
    mb,
  }) => {
    test.skip(
      !process.env.PW_QA_DB_ENABLED,
      "Restores the postgres-writable snapshot and drives WRITABLE_DB_ID — requires the writable QA postgres (set PW_QA_DB_ENABLED)",
    );

    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();
    // needed because of the restore on the line above
    await mb.api.activateToken("pro-self-hosted");

    await page.goto(`/admin/databases/${WRITABLE_DB_ID}`);

    await toggleDatabaseSwitch(page, /model actions/i);
    await toggleDatabaseSwitch(page, /database routing/i);

    await page.getByPlaceholder("Choose an attribute", { exact: true }).click();
    await expect(
      popover(page).getByText("@tenant.slug", { exact: true }),
    ).toHaveCount(0);

    await page.goto(
      `/admin/permissions/data/database/${WRITABLE_DB_ID}/impersonated/group/${COLLECTION_GROUP_ID}`,
    );
    await page.getByPlaceholder("Pick a user attribute", { exact: true }).click();
    await expect(
      popover(page).getByText("@tenant.slug", { exact: true }),
    ).toHaveCount(0);

    await page.goto(
      `/admin/permissions/data/group/${COLLECTION_GROUP_ID}/database/1/schema/PUBLIC/${STATIC_ORDERS_ID}/segmented`,
    );
    await page.getByPlaceholder("Pick a user attribute", { exact: true }).click();
    await expect(
      popover(page).getByText("@tenant.slug", { exact: true }),
    ).toHaveCount(0);

    await mb.api.put("/api/setting/use-tenants", { value: true });

    await createTenants(mb.api);
    await createUsers(mb.api);

    await page.goto(`/admin/databases/${WRITABLE_DB_ID}`);
    await toggleDatabaseSwitch(page, /database routing/i);

    await page.getByPlaceholder("Choose an attribute", { exact: true }).click();
    await popover(page)
      .getByRole("option", { name: /@tenant.slug/ })
      .getByTestId("system-defined-tooltip-icon")
      .hover();
    // The select input also has a tooltip on hover, so we need to findAll
    await expect(
      page.getByRole("tooltip").filter({ hasText: /This attribute is system defined/ }).first(),
    ).toContainText("This attribute is system defined");

    await page.goto(
      `/admin/permissions/data/database/${WRITABLE_DB_ID}/impersonated/group/${COLLECTION_GROUP_ID}`,
    );
    await page.getByPlaceholder("Pick a user attribute", { exact: true }).click();
    await expect(
      popover(page)
        .getByRole("option", { name: /@tenant.slug/ })
        .getByTestId("system-defined-tooltip-icon"),
    ).toHaveCount(1);

    await page.goto(
      `/admin/permissions/data/group/${COLLECTION_GROUP_ID}/database/1/schema/PUBLIC/${STATIC_ORDERS_ID}/segmented`,
    );
    await page.getByPlaceholder("Pick a user attribute", { exact: true }).click();
    await expect(
      popover(page)
        .getByRole("option", { name: /@tenant.slug/ })
        .getByTestId("system-defined-tooltip-icon"),
    ).toHaveCount(1);

    // check that tenant attributes propagate to users
    await visitTenantUsers(page);
    // Upstream passes a bogus second arg (1000) to findByText, which
    // testing-library treats as `options` and ignores — dropped.
    await expect(
      page.getByTestId("nav-item-external-users").getByText("Tenant users", {
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(
      adminPeopleListTable(page).getByText(
        `${GIZMO_USER.first_name} ${GIZMO_USER.last_name}`,
        { exact: true },
      ),
    ).toHaveCount(1);

    const ellipses = page.getByRole("button", { name: /ellipsis/ });
    await expect(ellipses).toHaveCount(3);

    const getUser = page.waitForResponse(
      (response) =>
        /^\/api\/user\/[^/]+$/.test(new URL(response.url()).pathname) &&
        response.request().method() === "GET",
    );
    const getTenant = page.waitForResponse(
      (response) =>
        /^\/api\/ee\/tenant\/[^/]+$/.test(new URL(response.url()).pathname) &&
        response.request().method() === "GET",
    );

    await ellipses.last().click();
    await popover(page).getByText("Edit user", { exact: true }).click();

    await getUser;
    await getTenant;

    await modal(page).getByText("Attributes", { exact: true }).click();
    for (const [key, value] of Object.entries(GIZMO_TENANT.attributes ?? {})) {
      await expect(modal(page).getByText(key, { exact: true })).toBeVisible();
      // cy.findByDisplayValue(value).should("be.visible")
      const control = await findByDisplayValue(modal(page), value);
      await expect(control).toBeVisible();
    }
  });
});

test.describe("tenant users", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "tenants are an EE feature — requires the pro-self-hosted token",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    await mb.api.put("/api/setting", {
      "jwt-attribute-email": "email",
      "jwt-attribute-firstname": "first_name",
      "jwt-attribute-lastname": "last_name",
      "jwt-enabled": true,
      "jwt-identity-provider-uri": "localhost:4000",
      "jwt-shared-secret":
        "0000000000000000000000000000000000000000000000000000000000000000",
      "jwt-user-provisioning-enabled?": true,
      "use-tenants": true,
    });

    await createTenants(mb.api);
    for (const user of USERS) {
      await provisionViaJwt(mb.baseUrl, user);
    }

    // Need to sign in as admin again because of the JWT logins
    await mb.signInAsAdmin();

    const TTAG_NAME = "tenant.name";

    const { id: QUESTION_ID } = await createNativeQuestion(mb.api, {
      name: "sql param in a dashboard",
      native: {
        query: `select * from products where lower(Category) = {{${TTAG_NAME}}}`,
        "template-tags": {
          [TTAG_NAME]: {
            id: "6b8b10ef-0104-1047-1e1b-2492d5954555",
            name: TTAG_NAME,
            "display-name": "tenant name",
            type: "text",
          },
        },
      },
    });

    await sandboxTable(mb.api, {
      table_id: STATIC_PRODUCTS_ID,
      card_id: QUESTION_ID,
      group_id: ALL_EXTERNAL_USERS_GROUP_ID,
      attribute_remappings: {
        "@tenant.slug": ["variable", ["template-tag", TTAG_NAME]],
      },
    });
  });

  test("should disable users on a tenant when disabling the tenant", async ({
    page,
  }) => {
    await visitTenantUsers(page);

    await rowContaining(page, "donthickey user")
      .getByRole("button", { name: /ellipsis/ })
      .click();

    await popover(page).getByText("Deactivate user", { exact: true }).click();
    await modal(page)
      .getByRole("button", { name: "Deactivate", exact: true })
      .click();

    await page.getByRole("link", { name: /tenants/i }).click();

    await rowContaining(page, "doohickey")
      .getByRole("button", { name: /ellipsis/ })
      .click();

    await popover(page).getByText("Deactivate tenant", { exact: true }).click();
    await modal(page)
      .getByRole("button", { name: "Deactivate", exact: true })
      .click();

    await page.getByRole("link", { name: /tenant users/i }).click();

    // assert that only gizmo users are still active
    await expect(
      adminLayoutContent(page).getByText("1 person found", { exact: true }),
    ).toHaveCount(1);

    await rowContaining(page, GIZMO_FULL_NAME)
      .getByRole("button", { name: /ellipsis/ })
      .click();

    await popover(page).getByText("Deactivate user", { exact: true }).click();
    await modal(page)
      .getByRole("button", { name: "Deactivate", exact: true })
      .click();

    // Upstream `.click({ force: true })`. Playwright's force-click moves the
    // REAL mouse and hits whatever is topmost — measured here as the still
    // unmounting Deactivate-modal overlay, leaving the "Active" tab selected
    // and the assertion below reading an empty list. dispatchEvent is the
    // faithful equivalent of Cypress's force (PORTING).
    await page
      .getByRole("tab", { name: "Deactivated", exact: true })
      .dispatchEvent("click");

    await expect(
      adminLayoutContent(page).getByText("3 people found", { exact: true }),
    ).toHaveCount(1);

    // Disabled users should still show their tenant names
    await expect(
      rowContaining(page, "donthickey user").getByRole("cell", {
        name: "Doohickey",
        exact: true,
      }),
    ).toHaveCount(1);

    await rowContaining(page, "donthickey user")
      .getByRole("link", { name: /refresh/ })
      .hover();

    await expect(tooltip(page).first()).toContainText(
      "Cannot reactivate users on a disabled tenant",
    );

    await rowContaining(page, GIZMO_FULL_NAME)
      .getByRole("link", { name: /refresh/ })
      .hover();

    await expect(tooltip(page).first()).toContainText("Reactivate this account");

    await page.getByRole("link", { name: /tenants/i }).click();
    await page.getByRole("tab", { name: "Deactivated", exact: true }).click();

    await rowContaining(page, "doohickey")
      .getByRole("button", { name: /ellipsis/ })
      .click();

    await popover(page).getByText("Reactivate tenant", { exact: true }).click();
    await modal(page)
      .getByRole("button", { name: "Reactivate", exact: true })
      .click();

    await page.getByRole("link", { name: /tenant users/i }).click();

    // Only 1 Doohickey user should have been re-activated
    await expect(
      adminLayoutContent(page).getByText("1 person found", { exact: true }),
    ).toHaveCount(1);

    await expect(rowContaining(page, "doohickey")).toHaveCount(1);
  });

  test("should accept a tenant when provisioning a user via JWT", async ({
    page,
    mb,
  }) => {
    await loginWithJwt(page, GIZMO_USER);

    await popover(page).getByText("Products", { exact: true }).click();
    await page.getByRole("button", { name: "Visualize", exact: true }).click();

    // `cy.get(sel).should("contain.text", x)` on a MULTI-element subject is
    // chai-jquery's `$el.text()`, i.e. the CONCATENATION of every match — not
    // a per-element or first-match check. Playwright's toContainText on a
    // multi-match locator is a strict-mode violation, so assert on the joined
    // text (`categoryColumnText`).
    expect(await categoryColumnText(page)).toContain("Gizmo");
    expect(await categoryColumnText(page)).not.toContain("Doohickey");
    expect(await categoryColumnText(page)).not.toContain("Gadget");
    expect(await categoryColumnText(page)).not.toContain("Widget");

    await loginWithJwt(page, DOOHICKEY_USER);

    await popover(page).getByText("Products", { exact: true }).click();
    await page.getByRole("button", { name: "Visualize", exact: true }).click();

    expect(await categoryColumnText(page)).toContain("Doohickey");
    expect(await categoryColumnText(page)).not.toContain("Gizmo");
    expect(await categoryColumnText(page)).not.toContain("Gadget");
    expect(await categoryColumnText(page)).not.toContain("Widget");

    await openNavigationSidebar(page);

    // ⚠️ VACUOUS UPSTREAM — ported verbatim, not strengthened.
    // `navbar-new-collection-button` exists NOWHERE in the product. `git log
    // -S` over all history finds the string only in this very Cypress spec
    // (introduced by the tenants PR #66661 and never implemented), and
    // `grep -rn` over frontend/src + enterprise/frontend/src returns nothing.
    // Probed directly: the same locator resolves to 0 for an ADMIN on the same
    // page, i.e. it can never match, so the assertion cannot fail for any
    // user. This is upstream's bug, not port drift — Cypress has identical
    // semantics. Left as-is per the faithfulness rule; the anchor below is an
    // ADDED (and clearly labelled) render gate, which cannot rescue a dead
    // selector but does stop the *surrounding* step from passing on a blank
    // page.
    await expect(
      navigationSidebar(page).getByTestId("navbar-new-collection-button"),
    ).toHaveCount(0);
    await expect(
      navigationSidebar(page).getByRole("link", { name: /Home/ }),
    ).toBeVisible();
  });

  test("should create a tenant group and add users to it", async ({ page }) => {
    const GROUP_NAME = "Favorites";
    await createTenantGroupFromUI(page, GROUP_NAME);
    await expect(
      adminContentTable(page).getByText(GROUP_NAME, { exact: true }),
    ).toHaveCount(1);

    await page
      .getByTestId("admin-layout-sidebar")
      .getByText(/Tenant users/)
      .click();

    // put existing user in a group
    await adminPeopleListTable(page)
      .getByLabel("ellipsis icon", { exact: true })
      .first()
      .click();
    await popover(page).getByText("Edit user", { exact: true }).click();

    await modal(page)
      .getByRole("combobox", { name: "Groups", exact: true })
      .click();
    await popover(page).getByText(GROUP_NAME, { exact: true }).click();

    // dismiss the dropdown
    await modal(page).getByText("Tenant groups", { exact: true }).click();
    await expect(
      modal(page).getByRole("list").getByText(GROUP_NAME, { exact: true }),
    ).toBeVisible();

    const updateUser = page.waitForResponse(
      (response) =>
        /^\/api\/user\/[^/]+$/.test(new URL(response.url()).pathname) &&
        response.request().method() === "PUT",
    );
    await modal(page).getByRole("button", { name: "Update", exact: true }).click();
    const updateResponse = await updateUser;
    const updateReqBody = JSON.parse(
      updateResponse.request().postData() ?? "{}",
    ) as { user_group_memberships?: unknown[] };
    const updateResBody = (await updateResponse.json()) as {
      user_group_memberships?: unknown[];
    };
    expect(updateReqBody.user_group_memberships).toHaveLength(2);
    expect(updateResBody.user_group_memberships).toHaveLength(2);

    // add user in a group
    await page
      .getByRole("button", { name: "Create tenant user", exact: true })
      .click();

    await modal(page).getByLabel("First name", { exact: true }).fill("Misty");
    await modal(page).getByLabel("Last name", { exact: true }).fill("Cerulean");
    await modal(page).getByLabel(/Email/).fill("misty@example.com");
    await modal(page).getByLabel(/Tenant/).click();

    await popover(page).getByText(GIZMO_TENANT.name, { exact: true }).click();
    await modal(page)
      .getByRole("combobox", { name: "Groups", exact: true })
      .click();
    await popover(page).getByText(GROUP_NAME, { exact: true }).click();

    // dismiss the dropdown
    await modal(page).getByText("Tenant groups", { exact: true }).click();
    await expect(
      modal(page).getByRole("list").getByText(GROUP_NAME, { exact: true }),
    ).toBeVisible();

    const createUser = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/user" &&
        response.request().method() === "POST",
    );
    await modal(page).getByRole("button", { name: "Create", exact: true }).click();
    const createResponse = await createUser;
    const createReqBody = JSON.parse(
      createResponse.request().postData() ?? "{}",
    ) as { user_group_memberships?: unknown[] };
    const createResBody = (await createResponse.json()) as {
      user_group_memberships?: unknown[];
    };
    expect(createReqBody.user_group_memberships).toHaveLength(2);
    expect(createResBody.user_group_memberships).toHaveLength(2);
  });

  test("can add tenant users to a tenant group via 'Add members", async ({
    page,
  }) => {
    const GROUP_NAME = "Marketing Team";
    await createTenantGroupFromUI(page, GROUP_NAME);
    await adminContentTable(page)
      .getByText(GROUP_NAME, { exact: true })
      .click();

    // Upstream passes a bogus `{ name: GROUP_NAME }` option to findByTestId,
    // which testing-library ignores — ported as the plain testid query.
    await expect(page.getByTestId("admin-pane-page-title")).toBeVisible();

    const listUsers = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/user" &&
        response.request().method() === "GET",
    );
    await page.getByRole("button", { name: "Add members", exact: true }).click();
    await listUsers;

    await page
      .getByRole("textbox", { name: /search for a user to add/i })
      .fill("gizmo");

    // tenant user should be visible
    await expect(
      popover(page).getByText(GIZMO_FULL_NAME, { exact: true }),
    ).toBeVisible();

    // internal user should not be visible
    await expect(
      popover(page).getByText("Bobby Tables", { exact: true }),
    ).toHaveCount(0);

    // select a tenant user to add
    await popover(page).getByText(GIZMO_FULL_NAME, { exact: true }).click();

    await page.getByRole("button", { name: "Add", exact: true }).click();

    // user should be added to the group
    await expect(
      adminContentTable(page).getByText(GIZMO_FULL_NAME, { exact: true }),
    ).toBeVisible();
  });
});

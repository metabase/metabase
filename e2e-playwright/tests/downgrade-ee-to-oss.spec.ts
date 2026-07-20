/**
 * Playwright port of
 * e2e/test/scenarios/permissions/downgrade-ee-to-oss.cy.spec.js
 *
 * Notes:
 * - The subject is the EE → OSS → EE token lifecycle, so both tests really do
 *   delete the premium token mid-run. `beforeEach` restores the snapshot (which
 *   resets `premium-embedding-token`) and re-activates it; an `afterEach`
 *   re-activates it as well so a mid-test failure can't leave a shared
 *   `PW_KEEP_SLOT_BACKENDS` slot token-less for the next spec. Neither hook
 *   changes what the tests assert.
 * - The whole spec is UI-driven through the admin permissions pages; nothing is
 *   set through the permission-graph API.
 * - `modifyPermission` is reused read-only from support/command-palette.ts,
 *   `assertPermissionTable` from support/create-queries.ts, `modal`/`popover`
 *   from support/ui.ts. The new pieces (`isPermissionDisabled`, the sandboxing
 *   modal flow, the inline save+confirm) live in support/downgrade-ee-to-oss.ts.
 * - Upstream's `cy.findByText("Save permissions?")` is a bare implicit
 *   existence assertion; ported as a real visibility assertion, and the graph
 *   PUT is awaited (see saveAndConfirmPermissions' comment for why).
 */
import { modifyPermission } from "../support/command-palette";
import { deleteToken } from "../support/admin-extras";
import { resolveToken } from "../support/api";
import { ALL_USERS_GROUP, assertPermissionTable } from "../support/create-queries";
import {
  EE_DATA_ACCESS_PERMISSION_INDEX,
  OSS_NATIVE_QUERIES_PERMISSION_INDEX,
  configureSandboxPolicy,
  isPermissionDisabled,
  saveAndConfirmPermissions,
} from "../support/downgrade-ee-to-oss";
import { test } from "../support/fixtures";

test.describe("scenarios > admin > permissions > downgrade ee to oss", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "needs the pro-self-hosted token — the spec is about losing and regaining it",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  // Token hygiene for shared slot backends: if a test dies between deleteToken
  // and the re-activation, the slot would stay OSS for every later spec.
  test.afterEach(async ({ mb }) => {
    await mb.api.activateToken("pro-self-hosted");
  });

  // we have a case where users may be downgraded for not paying but then will sort out billing and upgrade back to EE again.
  // we want to make sure that the users can still modify create-queries permissions with view-data values that would
  // normally disable the input (e.g. blocked, legacy-no-self-service) in EE. when modifying a row like that, we want the
  // view-data permissions to go up to unrestricted.
  test("should allow users to edit permissions after downgrading EE to OSS", async ({
    page,
    mb,
  }) => {
    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);
    await modifyPermission(
      page,
      "Sample Database",
      EE_DATA_ACCESS_PERMISSION_INDEX,
      "Blocked",
    );
    await saveAndConfirmPermissions(page);

    await deleteToken(mb.api);
    await page.reload();

    await assertPermissionTable(page, [["Sample Database", "No"]]);

    await isPermissionDisabled(
      page,
      "Sample Database",
      OSS_NATIVE_QUERIES_PERMISSION_INDEX,
      "No",
      false,
    );

    await modifyPermission(
      page,
      "Sample Database",
      OSS_NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder and native",
    );
    await saveAndConfirmPermissions(page);

    await mb.api.activateToken("pro-self-hosted");
    await page.reload();

    // Upstream lists a SIXTH permission value ("No") here, but its
    // assertPermissionTable iterates the *rendered* cells (`.each`), so any
    // expectation past the last rendered column is never evaluated. The
    // database-level EE table renders five: View data / Create queries /
    // Download results / Manage table metadata / Manage database. The sixth
    // column ("Transforms") is gated on the `transforms-basic` token feature,
    // which the pro-self-hosted token does not carry, so it is legitimately
    // absent. Asserting it here would be an over-reach on my part; the five
    // values below are exactly what upstream enforces. (Recorded in
    // findings-inbox/downgrade-ee-to-oss.md.)
    await assertPermissionTable(page, [
      [
        "Sample Database",
        "Can view",
        "Query builder and native",
        "No",
        "No",
        "No",
      ],
    ]);
  });

  // same context as other test, but also make sure that other rows with EE values are
  // unmodified if it's possible to keep their EE view-data values behind the scenes.
  // this will allow users to already have their old EE values when they go to upgrade again.
  test("should preserve unedited EE values in graph when OSS", async ({
    page,
    mb,
  }) => {
    // starting as EE, set a EE only value in the graph
    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);
    await modifyPermission(
      page,
      "Sample Database",
      EE_DATA_ACCESS_PERMISSION_INDEX,
      "Granular",
    );

    // set both people and orders tables to sandboxed (an EE only value)
    for (const [tableName, colName] of [
      ["Orders", "User ID"],
      ["People", "ID"],
    ]) {
      await modifyPermission(
        page,
        tableName,
        EE_DATA_ACCESS_PERMISSION_INDEX,
        "Row and column security",
      );

      await configureSandboxPolicy(page, colName, "attr_uid");
    }

    // save changes
    await saveAndConfirmPermissions(page);

    // downgrade to OSS
    await deleteToken(mb.api);
    await page.reload();

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

    await modifyPermission(
      page,
      "Orders",
      EE_DATA_ACCESS_PERMISSION_INDEX,
      "Query builder only",
    );

    await saveAndConfirmPermissions(page);

    // upgrade back to EE
    await mb.api.activateToken("pro-self-hosted");
    await page.reload();

    await assertPermissionTable(page, [
      ["Accounts", "Can view", "No", "1 million rows", "No"],
      ["Analytic Events", "Can view", "No", "1 million rows", "No"],
      ["Feedback", "Can view", "No", "1 million rows", "No"],
      ["Invoices", "Can view", "No", "1 million rows", "No"],
      [
        "Orders",
        "Row and column security",
        "Query builder only",
        "1 million rows",
        "No",
      ],
      ["People", "Row and column security", "No", "1 million rows", "No"],
      ["Products", "Can view", "No", "1 million rows", "No"],
      ["Reviews", "Can view", "No", "1 million rows", "No"],
    ]);
  });
});

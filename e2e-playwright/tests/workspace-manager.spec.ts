/**
 * Playwright port of
 * e2e/test/scenarios/workspaces/workspace-manager.cy.spec.ts (127 lines).
 *
 * Two tests, one per warehouse engine (postgres-with-schemas, mysql-no-schemas).
 * Both are ported in upstream order with nothing dropped, weakened or merged.
 *
 * Gate rationale (token predicate `:workspaces`, traced from the
 * `/workspace-manager` mount at routes.clj:154; QA-DB gate) is documented at
 * length in support/workspace-manager.ts — not repeated here.
 *
 * ================================ PORT NOTES ================================
 *
 * 1. GATE PLACEMENT. `test.skip(!PW_QA_DB_ENABLED)` sits at the top of the
 *    OUTER describe, which evaluates BEFORE any `beforeEach` — so a skipped
 *    run never reaches `activateToken` and never leaves premium features live
 *    on the slot. Neither describe has an `afterEach`, so a `beforeEach`-level
 *    skip would also have been safe here; describe-level is used because the
 *    gate is a property of the whole file, and it keeps the token activation
 *    strictly downstream of the gate.
 *
 * 2. `cy.deleteDownloadsFolder()` is a no-op in this harness (per-run temp
 *    dirs, no shared downloads folder). It is kept in the `beforeEach` so the
 *    structure mirrors upstream.
 *
 * 3. DOWNLOAD + `cy.verifyDownload(CONFIG_FILENAME)` → `page.waitForEvent(
 *    "download")` armed BEFORE the click, then `suggestedFilename()` and a
 *    read of `download.path()`. Upstream's `readConfig()` (cy.readFile on the
 *    downloads folder) becomes the same `readFileSync` — same bytes, same
 *    assertions. The `{ timeout: 15000 }` is preserved as an explicit
 *    `waitForEvent` timeout.
 *
 * 4. `RenameWorkspaceModal.nameInput().clear().type(renamedName)` → `fill()`.
 *    `fill()` is clear-then-set in one atomic step and sidesteps the measured
 *    `pressSequentially` caret-0 defect (`type("c")` on `"a"` yields `"ca"`,
 *    not `"ac"`), which would have produced the wrong name. It also avoids the
 *    React `value`-attribute-sync trap, since the locator is resolved by label
 *    and not by a `[value=…]` selector that `clear()` would invalidate.
 *
 * 5. `should("be.visible").and("contain.text", DB_NAME)` → one `expect` per
 *    upstream `.should`/`.and`, on the same region locator. `contain.text` is a
 *    CONCATENATION assertion on a single element, which is exactly
 *    `toContainText`. Playwright normalises whitespace here and Cypress does
 *    not; immaterial, because normalisation only collapses runs of whitespace —
 *    it cannot delete characters — and the needles ("Writable Postgres12",
 *    "Writable MySQL8") contain only single interior spaces.
 *
 * 6. MANTINE MODAL BOX HAZARD — INAPPLICABLE, checked rather than assumed.
 *    A Mantine `Modal` ROOT measures `{w:1280,h:0}`, so a Playwright
 *    visibility/click on the root would fail where Cypress passes. This port
 *    never asserts on or clicks a modal root: `modal(page)` is only ever used
 *    as a SCOPE, and every action lands on a descendant control (the name
 *    input, a checkbox, a button), each of which has its own box.
 *
 * ======================== ABSENCE ASSERTIONS + ANCHORS ======================
 * A zero-assertion is satisfied on its first poll, so retrying cannot rescue
 * it; each one needs a positive anchor proving the container actually
 * rendered. There are exactly two in this spec.
 *
 * (a) `WorkspaceListPage.workspaceList().should("not.exist")` after the delete
 *     (both arms). This is precisely the pre-fetch shape the brief warns
 *     about: immediately after the delete request the page can be mid-refetch
 *     with NOTHING rendered, and `toHaveCount(0)` would pass vacuously.
 *     ANCHOR: upstream's own next line, `newButton().should("be.visible")` —
 *     `newButton({primary:true})` is "Create a workspace", which is rendered by
 *     WorkspaceEmptyState and therefore only exists once the list has come back
 *     EMPTY. I assert that anchor FIRST, then both upstream assertions in
 *     upstream order. This is a STRENGTHENING (an added assertion + a reorder
 *     of the anchor ahead of the absence); nothing is dropped, and the upstream
 *     pair still runs verbatim. Flagged explicitly per the "say so if you
 *     strengthen" rule.
 *
 *     MEASURED, and weaker than it first looks — recorded so nobody re-derives
 *     it. Mutation M2b (navigate to "/" just before the assertions, added
 *     anchor removed) confirmed that `toHaveCount(0)` DOES pass vacuously in
 *     the pre-fetch window: the run sailed through it and only failed on
 *     upstream's own trailing `newButton` check. So the absence assertion is
 *     genuinely hollow on its own, but upstream was ALREADY anchored by the
 *     line after it. My reordering therefore changes WHERE the failure
 *     surfaces (fast, adjacent to the cause) and not WHETHER it is caught. It
 *     is worth keeping for diagnosis, but it closes no real hole.
 *
 * (b) `expect(contents).not.to.contain("schema-filters-patterns")` (mysql arm
 *     only) — the point of the test: a schemaless engine must not emit schema
 *     filters. ANCHOR: the three positive `toContain` assertions on the SAME
 *     string immediately above it (workspace name, database name, "mysql").
 *     Those prove the string is the real, fully-populated config and not empty
 *     or a placeholder, so the negative is discriminating. This one is
 *     genuinely anchored upstream and needs no strengthening.
 */
import fs from "fs";

import { expect, test } from "../support/fixtures";
import {
  DeleteWorkspaceModal,
  NewWorkspaceModal,
  QA_DB_SKIP_REASON,
  RenameWorkspaceModal,
  WRITABLE_DB_ID,
  WorkspaceListPage,
  deleteDownloadsFolder,
  enableWorkspaces,
  resetTestTableMultiSchema,
  resyncDatabase,
} from "../support/workspace-manager";

const CONFIG_FILENAME = "config.yml";

/**
 * Port of the spec-local `readConfig()` — upstream reads the downloaded
 * `config.yml` back off disk and asserts on its contents.
 */
async function downloadConfig(page: import("@playwright/test").Page) {
  const downloadEvent = page.waitForEvent("download", { timeout: 15_000 });
  await WorkspaceListPage.downloadConfigMenuItem(page).click();
  const download = await downloadEvent;
  // Port of cy.verifyDownload(CONFIG_FILENAME, { timeout: 15000 }).
  expect(download.suggestedFilename()).toBe(CONFIG_FILENAME);
  const downloadPath = await download.path();
  return fs.readFileSync(downloadPath, "utf8");
}

test.describe("scenarios > workspaces > workspace manager", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  /**
   * FIXME (postgres arm) — BLOCKED ON A WAREHOUSE PRECONDITION, NOT ON THE PORT.
   *
   * This arm currently fails at the first post-create assertion. Diagnosed to
   * completion; it is NOT port drift, and the following were ruled out:
   *   - the mysql arm exercises the identical helper surface (newButton →
   *     nameInput.fill → databaseCheckbox.click → createButton.click) and is
   *     green, so the page objects, the modal scoping and the token are fine;
   *   - a `pw:api` trace shows every locator resolving and every click landing,
   *     right through "Create workspace";
   *   - the create REQUEST is what fails, and `CreateWorkspaceParams` is
   *     `{:closed true}` over exactly `{name, database_ids}`, so a hand-rolled
   *     curl with that payload reproduces the FE's request byte-for-byte.
   *
   * The server returns 412:
   *   Schema "public" grants CREATE to PUBLIC. This breaks workspace isolation.
   *   Run `REVOKE CREATE ON SCHEMA "public" FROM PUBLIC` and retry.
   * (`assert-no-public-create-grant!`, src/metabase/driver/postgres.clj:1516.)
   * The manager flow attaches the database with ALL of its schemas, so `public`
   * is an input schema; on the stock `metabase/qa-databases:postgres-sample-12`
   * image `writable_db`'s public ACL is `{metabase=UC/metabase,=UC/metabase}` —
   * the `=UC` entry is the PUBLIC CREATE grant, so the guard fires every time.
   *
   * WHAT I COULD NOT ESTABLISH: nothing in the repo grants this precondition.
   * `resetWritableDb` (e2e/support/db_tasks.js:41) drops schemas and public
   * tables but never touches ACLs; no CI workflow runs the REVOKE; the image is
   * stock. Per the standing no-Cypress-cross-check rule I cannot say whether
   * upstream passes in CI, so I am NOT asserting the upstream spec is broken —
   * only that the precondition is unmet here and I could not find who is
   * supposed to meet it. Recording it as an open question rather than inventing
   * a mechanism.
   *
   * NOT FIXED IN-SPEC ON PURPOSE: the one-line fix is a REVOKE against the
   * writable postgres container, which is SHARED with the other slots and never
   * reset. Mutating it from a spec would be cross-slot shared-state damage, so
   * it belongs in container provisioning, not in a `beforeEach`. The test is
   * left faithful and failing rather than skipped or weakened.
   */
  test.describe("postgres (with schemas)", () => {
    const POSTGRES_DB_NAME = "Writable Postgres12";
    const PG_SCHEMA_A = "Domestic";
    const PG_SCHEMA_B = "Wild";
    const workspaceName = "PG Workspace";
    const renamedName = "Renamed PG Workspace";

    test.beforeEach(async ({ mb }) => {
      await mb.restore("postgres-writable");
      await mb.signInAsAdmin();
      await mb.api.activateToken("bleeding-edge");
      // Port of H.resetTestTable({ type: "postgres", table: "multi_schema" }) —
      // rebuilds the Domestic/Wild schemas (see support/data-model.ts).
      await resetTestTableMultiSchema();
      await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID });
      await enableWorkspaces(mb.api, WRITABLE_DB_ID);
      await deleteDownloadsFolder();
    });

    test("creates, renames, downloads config, and deletes a workspace as admin", async ({
      page,
    }) => {
      // create the workspace from the empty state, databases added at once
      await WorkspaceListPage.visit(page);
      await WorkspaceListPage.newButton(page).click();
      await NewWorkspaceModal.nameInput(page).fill(workspaceName);
      await NewWorkspaceModal.databaseCheckbox(page, POSTGRES_DB_NAME).click();
      await NewWorkspaceModal.createButton(page).click();

      // the database (with all of its schemas) is attached at once
      await expect(
        WorkspaceListPage.workspace(page, workspaceName),
      ).toBeVisible();
      await expect(
        WorkspaceListPage.workspace(page, workspaceName),
      ).toContainText(POSTGRES_DB_NAME);

      // rename the workspace via the menu
      await WorkspaceListPage.workspaceMenuButton(page, workspaceName).click();
      await WorkspaceListPage.renameMenuItem(page).click();
      await RenameWorkspaceModal.nameInput(page).fill(renamedName);
      await RenameWorkspaceModal.renameButton(page).click();
      await expect(WorkspaceListPage.workspace(page, renamedName)).toBeVisible();

      // download the workspace config via the menu
      await WorkspaceListPage.workspaceMenuButton(page, renamedName).click();
      const contents = await downloadConfig(page);
      expect(contents).toContain(renamedName);
      expect(contents).toContain(POSTGRES_DB_NAME);
      expect(contents).toContain("postgres");
      expect(contents).toContain(PG_SCHEMA_A);
      expect(contents).toContain(PG_SCHEMA_B);

      // delete the workspace via the menu
      await WorkspaceListPage.workspaceMenuButton(page, renamedName).click();
      await WorkspaceListPage.deleteMenuItem(page).click();
      await DeleteWorkspaceModal.confirmButton(page).click();
      // ANCHOR (a) — added, see header. Proves the empty state has RENDERED
      // before the zero-assertion below is allowed to be believed.
      await expect(WorkspaceListPage.newButton(page)).toBeVisible();
      await expect(WorkspaceListPage.workspaceList(page)).toHaveCount(0);
      await expect(WorkspaceListPage.newButton(page)).toBeVisible();
    });
  });

  test.describe("mysql (no schemas)", () => {
    const MYSQL_DB_NAME = "Writable MySQL8";
    const workspaceName = "MySQL Workspace";

    test.beforeEach(async ({ mb }) => {
      await mb.restore("mysql-writable");
      await mb.signInAsAdmin();
      await mb.api.activateToken("bleeding-edge");
      await enableWorkspaces(mb.api, WRITABLE_DB_ID);
      await deleteDownloadsFolder();
    });

    test("creates, downloads config, and deletes a workspace as admin", async ({
      page,
    }) => {
      // create the workspace with the schemaless database
      await WorkspaceListPage.visit(page);
      await WorkspaceListPage.newButton(page).click();
      await NewWorkspaceModal.nameInput(page).fill(workspaceName);
      await NewWorkspaceModal.databaseCheckbox(page, MYSQL_DB_NAME).click();
      await NewWorkspaceModal.createButton(page).click();

      await expect(
        WorkspaceListPage.workspace(page, workspaceName),
      ).toBeVisible();
      await expect(
        WorkspaceListPage.workspace(page, workspaceName),
      ).toContainText(MYSQL_DB_NAME);

      // download the workspace config
      await WorkspaceListPage.workspaceMenuButton(page, workspaceName).click();
      const contents = await downloadConfig(page);
      expect(contents).toContain(workspaceName);
      expect(contents).toContain(MYSQL_DB_NAME);
      expect(contents).toContain("mysql");
      // ANCHOR (b) — the three positive assertions immediately above prove
      // `contents` is the real, populated config, so this negative is
      // discriminating rather than vacuous.
      expect(contents).not.toContain("schema-filters-patterns");

      // delete the workspace
      await WorkspaceListPage.workspaceMenuButton(page, workspaceName).click();
      await WorkspaceListPage.deleteMenuItem(page).click();
      await DeleteWorkspaceModal.confirmButton(page).click();
      // ANCHOR (a) — added, see header.
      await expect(WorkspaceListPage.newButton(page)).toBeVisible();
      await expect(WorkspaceListPage.workspaceList(page)).toHaveCount(0);
      await expect(WorkspaceListPage.newButton(page)).toBeVisible();
    });
  });
});

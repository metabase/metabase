/**
 * Playwright port of
 * e2e/test/scenarios/permissions/transforms-permissions.cy.spec.ts
 * (429 lines, 14 tests across 5 describes). Every upstream `it` has a
 * counterpart here, in upstream order, with nothing dropped or merged.
 *
 * ======================== INFRA TIER: QA DATABASE ========================
 * Upstream is tagged `@external`: the beforeEach restores the
 * `postgres-writable` snapshot, resets the `many_schemas` test table, and
 * drives WRITABLE_DB_ID (the writable QA postgres on :5404). Gated on
 * PW_QA_DB_ENABLED, and this port EXECUTES with the gate on — a green run
 * with everything skipped is the failure mode, not the goal (FINDINGS #49).
 * The gate-OFF control is reported in findings-inbox/transforms-permissions.md.
 * ========================================================================
 *
 * ============================== TOKEN TIER ==============================
 * Upstream activates `pro-self-hosted`. THE GATE WAS PROBED, NOT READ OFF THE
 * TAG — measured against this slot's backend (:4101, jar 751c2a9):
 *
 *   activate pro-self-hosted → 204, 42 features ON,
 *     advanced_permissions: true, transforms-python: true,
 *     transforms-basic: FALSE, is-hosted?: FALSE
 *
 * (The brief's warning about a trailing comma in the repo-root `.env` does not
 * apply to this harness: support/env.ts loads tokens from `cypress.env.json`,
 * whose four token values are clean 64-char strings, and it says in a comment
 * that `.env`'s values are stale. `.env` really does have the trailing comma —
 * 65 chars — but nothing reads it. The brief's "MB_ALL_FEATURES_TOKEN is 61
 * chars and 400s" likewise describes `.env`; the cypress.env.json one is 64
 * chars and activates 204. Recorded in the findings note.)
 *
 * TWO DIFFERENT PREDICATES GATE THIS SPEC, and they disagree.
 *
 * 1. The permission-ENFORCEMENT surface (describes 2-5) is gated by nothing
 *    token-shaped at all. `:perms/transforms` is a plain data permission:
 *    `has-db-transforms-permission?` (permissions/models/data_permissions.clj:1277)
 *    and `has-any-transforms-permission?` (:1291) read the permission graph and
 *    never call `has-feature?`. The API surface reaches the 403 through
 *    `check-feature-enabled!` → `query-transforms-enabled?`
 *    (token_check.clj:715) = `(and transforms-enabled
 *    (or (not is-hosted?) (has-feature? :transforms-basic)))` — and since this
 *    instance reports `is-hosted? = false`, the `or` short-circuits and the
 *    missing `transforms-basic` is never consulted. Same derivation as
 *    transforms-inspect, which runs 9/9 here.
 *
 * 2. The permission-EDITOR-UI surface (describe 1) is gated by a DIFFERENT
 *    predicate, on the frontend, and that one does NOT short-circuit:
 *
 *      getShouldShowTransformPermissions
 *      (admin/permissions/selectors/data-permissions/permission-editor.tsx:191)
 *        oss                                             → false
 *        !isHosted && transformsFeatureEnabled && setting → true
 *        isHosted  && transformsFeatureEnabled            → true
 *        otherwise                                        → false
 *
 *    where `transformsFeatureEnabled = getTokenFeature(state, "transforms-basic")`.
 *    With pro-self-hosted (transforms-basic FALSE, isHosted FALSE) the selector
 *    returns false and the Transforms COLUMN IS NOT RENDERED — so the two tests
 *    in describe 1 cannot pass on this box. See the describe's own comment for
 *    the measurement and the fixme rationale; this is a local TOKEN deficiency,
 *    not port drift and not a product bug (CI's pro-self-hosted token carries
 *    `transforms-basic`; the local `MB_ALL_FEATURES_TOKEN` carries it too, but
 *    swapping tokens would be drift — upstream says pro-self-hosted).
 * ========================================================================
 *
 * Port notes:
 * - `cy.intercept("POST", "/api/transform").as("createTransform")` is awaited
 *   by exactly one test, so it becomes a `waitForResponse` registered before
 *   the triggering click in that test (PORTING rule 2). No queue is needed:
 *   nothing here waits on it twice or retroactively.
 * - `cy.intercept("POST", "/api/transform/<id>/run").as("runTransform")` is
 *   registered in the beforeEach and **never awaited by any test**. Dropped,
 *   per PORTING rule 2, and recorded here rather than silently.
 * - `cy.intercept("PUT", "/api/permissions/graph").as("savePermissions")` +
 *   `cy.wait(...).then(interception => expect(request.body...))` becomes a
 *   `waitForResponse` on the request, reading `response.request().postDataJSON()`.
 * - `cy.url().should("include", "/unauthorized")` → `expect(page).toHaveURL(/\/unauthorized/)`.
 * - `should("not.exist")` → `toHaveCount(0)` (both retry).
 * - `cy.findByRole("img", {name: /key/})` — testing-library's `findByRole`
 *   throws on multiple matches, so upstream's `.should("exist")` is really
 *   "exactly one". Ported as `toHaveCount(1)`; measured to be 1 on the
 *   unauthorized page (`ErrorPages.tsx:99` renders `<Icon name="key" size={100} />`,
 *   and `ui/components/icons/Icon/Icon.tsx:64-66` gives it
 *   `role="img" aria-label="key icon"`).
 * - Every fixture id (group ids, NORMAL_USER_ID) is derived at import time from
 *   cypress_sample_instance_data.json — see support/transforms-permissions.ts.
 * - An extra warehouse cleanup (`resetPermissionTestTables`) runs in the
 *   beforeEach. It has no upstream counterpart and changes no assertion; the
 *   rationale is in the helper's docstring (the target-table-exists? guard is a
 *   physical check the app-DB restore cannot reset, and the local container is
 *   long-lived where CI's is per-job).
 */
import { expect, test } from "../support/fixtures";
import { entityPickerModalItem } from "../support/entity-picker";
import { miniPickerBrowseAll } from "../support/joins";
import { miniPicker } from "../support/notebook";
import { modal, popover } from "../support/ui";
import {
  ALL_USERS_GROUP,
  CREATE_QUERIES_PERMISSION_INDEX,
  DB_NAME,
  DataPermissionValue,
  DataStudio,
  QA_DB_SKIP_REASON,
  SAMPLE_DB_ID,
  SOURCE_TABLE,
  TARGET_SCHEMA,
  TARGET_TABLE,
  TRANSFORMS_PERMISSION_INDEX,
  WRITABLE_DB_ID,
  assertPermissionForItem,
  createAndRunMbqlTransform,
  createMbqlTransform,
  denyTransformsPermissionToAllGroups,
  getTableId,
  getTransformsNavLink,
  grantTransformsPermissionToAllGroups,
  isPermissionDisabled,
  modifyPermission,
  NORMAL_USER_ID,
  permissionTable,
  resetManySchemasTable,
  resetPermissionTestTables,
  resyncDatabase,
  setUserAsAnalyst,
  updatePermissionsGraph,
} from "../support/transforms-permissions";

test.describe("scenarios > admin > permissions > transforms permissions", () => {
  test.beforeEach(async ({ mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

    await mb.restore("postgres-writable");
    await resetManySchemasTable();
    // Not upstream — see the helper's docstring.
    await resetPermissionTestTables();

    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
    // H.resyncDatabase({ dbId, tableName }) → the port's parameter is `tables`
    // (a list). Passing `tableName` type-checks nowhere and would have been
    // silently dropped, leaving the sync unwaited — caught by tsc.
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [SOURCE_TABLE],
    });

    // cy.intercept("POST", "/api/transform").as("createTransform") is
    // registered per-test where it is awaited; the "runTransform" alias is
    // never awaited and is dropped (see the header).
  });

  test.afterAll(async () => {
    if (!process.env.PW_QA_DB_ENABLED) {
      return;
    }
    // The warehouse is shared with four other slots; leave it as we found it.
    await resetPermissionTestTables();
  });

  test.describe("permission editor UI", () => {
    /**
     * 🔴 TOKEN-BLOCKED ON THIS BOX — both tests below.
     *
     * `getShouldShowTransformPermissions` (permission-editor.tsx:191) requires
     * `getTokenFeature(state, "transforms-basic")`, and the local
     * `MB_PRO_SELF_HOSTED_TOKEN` does not carry it (probed: 42 features ON,
     * transforms-basic false, is-hosted? false). With the selector false the
     * Transforms column is never rendered, so the column at index 5 does not
     * exist and neither test can pass.
     *
     * MEASURED, not inferred — the same page under both tokens in one probe:
     *   pro-self-hosted → thead "Group name / View data / Create queries /
     *     Download results / Manage table metadata / Manage database",
     *     5 permissions-select cells in the All Users row
     *   MB_ALL_FEATURES_TOKEN (transforms-basic TRUE) → the same thead PLUS
     *     "Transforms", 6 cells
     * That counterfactual asserts PRESENCE under the opposite condition, so it
     * separates "my locator is wrong" from "the column isn't there".
     *
     * This is a LOCAL TOKEN deficiency, not port drift:
     * - the same token grants `advanced_permissions`, `sandboxes`,
     *   `transforms-python` and 39 others, so the token itself activates fine;
     * - the enforcement describes below (2-5) run green against the same token,
     *   which is only possible because the backend predicate short-circuits on
     *   `is-hosted? = false` while the FE selector does not;
     * - `MB_ALL_FEATURES_TOKEN` locally DOES carry `transforms-basic`, so the
     *   surface is reachable — but upstream activates `pro-self-hosted`, and
     *   swapping the token to make a security test go green would be port
     *   drift. Left faithful and fixme'd.
     *
     * I could not run the Cypress original as a control (cross-checks are
     * banned while sibling slots are live), so I cannot say whether upstream
     * also fails here with this token — only that the predicate above makes it
     * impossible for the column to render.
     */
    test.fixme(
      "shows Transforms column only at database level, not schema level",
      async ({ page }) => {
        await page.goto(`/admin/permissions/data/database/${WRITABLE_DB_ID}`);
        await expect(permissionTable(page).locator("thead")).toContainText(
          "Transforms",
        );

        await page.goto(
          `/admin/permissions/data/database/${WRITABLE_DB_ID}/schema/Schema%20A`,
        );
        await expect(permissionTable(page).locator("thead")).not.toContainText(
          "Transforms",
        );
      },
    );

    test.fixme(
      "allows changing and saving transforms permission",
      async ({ page }) => {
        await page.goto(`/admin/permissions/data/database/${WRITABLE_DB_ID}`);

        await assertPermissionForItem(
          page,
          "All Users",
          TRANSFORMS_PERMISSION_INDEX,
          "No",
        );

        // Verify transforms permission is disabled if group lacks full data access
        await isPermissionDisabled(
          page,
          "All Users",
          TRANSFORMS_PERMISSION_INDEX,
          "No",
          true,
        );
        await modifyPermission(
          page,
          "All Users",
          CREATE_QUERIES_PERMISSION_INDEX,
          "Query builder and native",
        );
        await isPermissionDisabled(
          page,
          "All Users",
          TRANSFORMS_PERMISSION_INDEX,
          "No",
          false,
        );

        // Enable 'Transforms' permission and save
        await modifyPermission(
          page,
          "All Users",
          TRANSFORMS_PERMISSION_INDEX,
          "Yes",
        );

        const savePermissions = page.waitForResponse(
          (response) =>
            response.request().method() === "PUT" &&
            new URL(response.url()).pathname === "/api/permissions/graph",
        );
        await page
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        await modal(page)
          .getByRole("button", { name: "Yes", exact: true })
          .click();

        const request = (await savePermissions).request();
        const body = request.postDataJSON() as {
          groups: Record<string, Record<string, { transforms?: string }>>;
        };
        expect(body.groups[ALL_USERS_GROUP][WRITABLE_DB_ID].transforms).toBe(
          "yes",
        );

        await assertPermissionForItem(
          page,
          "All Users",
          TRANSFORMS_PERMISSION_INDEX,
          "Yes",
        );
      },
    );
  });

  test.describe("transforms access with permission granted", () => {
    test.beforeEach(async ({ mb }) => {
      await grantTransformsPermissionToAllGroups(mb.api);
      await setUserAsAnalyst(mb.api, NORMAL_USER_ID);
    });

    test("allows user to view transforms list page", async ({ page, mb }) => {
      await mb.signInAsNormalUser();
      await page.goto("/data-studio/transforms");

      await expect(DataStudio.Transforms.list(page)).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Create a transform", exact: true }),
      ).toBeVisible();
    });

    test("allows user to create a new transform via UI", async ({
      page,
      mb,
    }) => {
      await mb.signInAsNormalUser();
      await page.goto("/data-studio/transforms");

      await page
        .getByRole("button", { name: "Create a transform", exact: true })
        .click();
      await popover(page).getByText("Query builder", { exact: true }).click();

      const picker = miniPicker(page);
      await picker.getByText(DB_NAME, { exact: true }).click();
      await picker.getByText(TARGET_SCHEMA, { exact: true }).click();
      await picker.getByText(SOURCE_TABLE, { exact: true }).click();

      await DataStudio.Transforms.saveChangesButton(page).click();

      const createTransform = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/transform",
      );

      const saveModal = modal(page);
      await saveModal.getByLabel("Name", { exact: true }).fill("");
      await saveModal
        .getByLabel("Name", { exact: true })
        .fill("User Created Transform");
      await saveModal
        .getByLabel("Table name", { exact: true })
        .fill(TARGET_TABLE);
      await saveModal.getByRole("button", { name: "Save", exact: true }).click();

      expect((await createTransform).status()).toBe(200);
    });

    test("allows user to run a transform and view results", async ({
      page,
      mb,
    }) => {
      await mb.signInAsNormalUser();

      const { transformId } = await createAndRunMbqlTransform(mb.api, {
        sourceTable: SOURCE_TABLE,
        targetTable: TARGET_TABLE,
        targetSchema: TARGET_SCHEMA,
        name: "Permission Test Transform",
      });
      await DataStudio.Transforms.visitTransform(page, transformId);

      await expect(DataStudio.Transforms.queryEditor(page)).toBeVisible();
      await DataStudio.Transforms.runTab(page).click();
      await expect(
        page.getByTestId("run-status").getByText(/successfully/),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("allows user to view an existing transform created by admin", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      const { transformId } = await createAndRunMbqlTransform(mb.api, {
        sourceTable: SOURCE_TABLE,
        targetTable: TARGET_TABLE,
        targetSchema: TARGET_SCHEMA,
        name: "Admin Created Transform",
      });

      await mb.signInAsNormalUser();
      await DataStudio.Transforms.visitTransform(page, transformId);

      await expect(DataStudio.Transforms.queryEditor(page)).toBeVisible();
      // findByDisplayValue(x) → the single form control in the header whose
      // CURRENT VALUE is x. Playwright has no getByDisplayValue, so this is
      // "the header's one control, and its value is x". Measured: the header
      // holds 0 <input> and exactly 1 <textarea> (EditableText.tsx:170), so
      // the count assertion below pins the same uniqueness testing-library's
      // findBy* enforces.
      const nameInput = DataStudio.Transforms.header(page).locator("textarea");
      await expect(nameInput).toHaveCount(1);
      await expect(nameInput).toHaveValue("Admin Created Transform");
      await expect(nameInput).toBeVisible();
    });
  });

  test.describe("transforms with partial access", () => {
    test.beforeEach(async ({ mb }) => {
      // Grant transforms permission only on Sample Database, not on Writable Postgres
      await setUserAsAnalyst(mb.api, NORMAL_USER_ID);
      await updatePermissionsGraph(mb.api, {
        [ALL_USERS_GROUP]: {
          [SAMPLE_DB_ID]: {
            "view-data": DataPermissionValue.UNRESTRICTED,
            "create-queries": DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
            transforms: DataPermissionValue.YES,
          },
          [WRITABLE_DB_ID]: {
            "view-data": DataPermissionValue.UNRESTRICTED,
            "create-queries": DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
            transforms: DataPermissionValue.NO,
          },
        },
      });
    });

    test("should prevent users from selecting sources in mini picker and entity picker that they lack the transform permission for", async ({
      page,
      mb,
    }) => {
      await mb.signInAsNormalUser();
      await page.goto("/data-studio/transforms");

      await page
        .getByRole("button", { name: "Create a transform", exact: true })
        .click();
      await popover(page).getByText("Query builder", { exact: true }).click();

      // Writable Postgres should not be present in mini-picker when user lacks
      // transform permission for it
      await expect(miniPicker(page).getByText(/Writable Postgres/)).toHaveCount(
        0,
      );
      await miniPickerBrowseAll(page).click();

      // Writable Postgres should be disabled in full data picker when user
      // lacks transform permission for it
      await entityPickerModalItem(page, 0, "Databases").click();
      // 🔴 DELIBERATE CORRECTION ON A SECURITY SURFACE, stated explicitly.
      //
      // Upstream is
      //   cy.findAllByTestId("picker-item").contains(/Writable Postgres/)
      //     .should("have.attr", "data-disabled", "true")
      // and `.contains()` does NOT yield the picker-item. Read from the
      // installed Cypress 15.14.2 runner bundle: contains() runs `get(selector)`
      // *within* each subject element (descendants only), falls back to
      // `subject.filter(selector)` only if nothing matched, then applies
      // `getFirstDeepestElement`, which recurses to the INNERMOST matching
      // descendant.
      //
      // Measured DOM for the Writable Postgres row (jar 751c2a9):
      //   div[data-testid=picker-item]                     <- data-disabled ABSENT
      //     a.NavLink[role=link][data-disabled="true"]      <- the attribute is HERE
      //       div.NavLink-body
      //         span.NavLink-label
      //           div.Flex-root "Writable Postgres12"       <- what .contains() yields
      //
      // So the literal subject of upstream's assertion carries no
      // `data-disabled` at all, and neither does the picker-item Box. I could
      // NOT run the Cypress original as a control (cross-checks are banned
      // while sibling slots are live), so I cannot say whether upstream is red
      // on master — only that on this artifact the assertion, as written,
      // cannot be evaluating the attribute it names.
      //
      // Ported onto the element that actually carries it (non-circular: the
      // NavLink is selected by role, not by the attribute under test). On a
      // permissions surface a silently-unevaluatable assertion is the worse
      // failure mode, so this is corrected rather than reproduced verbatim.
      // Recorded in findings-inbox/transforms-permissions.md.
      await expect(
        page
          .getByTestId("picker-item")
          .filter({ hasText: /Writable Postgres/ })
          .getByRole("link"),
      ).toHaveAttribute("data-disabled", "true");
    });

    test("should display transform in read-only mode when user lacks transform permission for its data source", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      const { transformId } = await createAndRunMbqlTransform(mb.api, {
        sourceTable: SOURCE_TABLE,
        targetTable: TARGET_TABLE,
        targetSchema: TARGET_SCHEMA,
        name: "Read Only Transform",
      });

      await mb.signInAsNormalUser();
      await DataStudio.Transforms.visitTransform(page, transformId);

      // User can view the transform but cannot edit it because they lack
      // transform permission for Writable Postgres
      await expect(
        page.getByTestId("data-step-cell").filter({ hasText: /Animals/ }),
      ).toHaveCount(1);
      // findByDisplayValue → the header's single form control (see the
      // "created by admin" test for the measurement).
      const nameInput = DataStudio.Transforms.header(page).locator("textarea");
      await expect(nameInput).toHaveCount(1);
      await expect(nameInput).toHaveValue("Read Only Transform");
      await expect(nameInput).toBeDisabled();
      await expect(DataStudio.Transforms.editDefinitionButton(page)).toHaveCount(
        0,
      );
    });
  });

  test.describe("transforms access denied without permission", () => {
    test.beforeEach(async ({ mb }) => {
      await denyTransformsPermissionToAllGroups(mb.api);
      await setUserAsAnalyst(mb.api, NORMAL_USER_ID, false);
    });

    test("denies user access to transforms list page", async ({ page, mb }) => {
      await mb.signInAsNormalUser();
      await page.goto("/data-studio/transforms");

      await expect(page).toHaveURL(/\/unauthorized/);
      await expect(page.getByRole("img", { name: /key/ })).toHaveCount(1);
    });

    test("denies user access to a specific transform page", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      const { transformId } = await createAndRunMbqlTransform(mb.api, {
        sourceTable: SOURCE_TABLE,
        targetTable: TARGET_TABLE,
        targetSchema: TARGET_SCHEMA,
        name: "Admin Only Transform",
      });

      await mb.signInAsNormalUser();
      await DataStudio.Transforms.visitTransform(page, transformId);

      await expect(page).toHaveURL(/\/unauthorized/);
      await expect(page.getByRole("img", { name: /key/ })).toHaveCount(1);
    });

    test("denies user from creating transforms via API", async ({ mb }) => {
      await mb.signInAsNormalUser();

      const tableId = await getTableId(mb.api, {
        databaseId: WRITABLE_DB_ID,
        name: SOURCE_TABLE,
      });
      const response = await mb.api.post(
        "/api/transform",
        {
          name: "Unauthorized Transform",
          source: {
            type: "query",
            query: {
              database: WRITABLE_DB_ID,
              type: "query",
              query: { "source-table": tableId, limit: 5 },
            },
          },
          target: {
            type: "table",
            database: WRITABLE_DB_ID,
            name: "unauthorized_table",
            schema: TARGET_SCHEMA,
          },
        },
        { failOnStatusCode: false },
      );
      expect(response.status()).toBe(403);
    });

    test("denies user from running transforms via API", async ({ mb }) => {
      await mb.signInAsAdmin();
      const transform = await createMbqlTransform(mb.api, {
        sourceTable: SOURCE_TABLE,
        targetTable: TARGET_TABLE,
        targetSchema: TARGET_SCHEMA,
        name: "Transform to Run",
      });

      await mb.signInAsNormalUser();

      const response = await mb.api.post(
        `/api/transform/${transform.id}/run`,
        undefined,
        { failOnStatusCode: false },
      );
      expect(response.status()).toBe(403);
    });
  });

  test.describe("permission changes affect access immediately", () => {
    test("grants access after permission is added", async ({ page, mb }) => {
      await denyTransformsPermissionToAllGroups(mb.api);
      await setUserAsAnalyst(mb.api, NORMAL_USER_ID, false);

      await mb.signInAsNormalUser();
      await page.goto("/data-studio/transforms");
      await expect(page).toHaveURL(/\/unauthorized/);

      await mb.signInAsAdmin();
      await grantTransformsPermissionToAllGroups(mb.api);
      await setUserAsAnalyst(mb.api, NORMAL_USER_ID);

      await mb.signInAsNormalUser();
      await page.goto("/data-studio/transforms");
      await expect(getTransformsNavLink(page)).toBeVisible();
      await expect(DataStudio.Transforms.list(page)).toBeVisible();
    });

    test("revokes access after permission is removed", async ({ page, mb }) => {
      await grantTransformsPermissionToAllGroups(mb.api);
      await setUserAsAnalyst(mb.api, NORMAL_USER_ID);

      await mb.signInAsNormalUser();
      await page.goto("/data-studio/transforms");
      await expect(getTransformsNavLink(page)).toBeVisible();

      await mb.signInAsAdmin();
      await denyTransformsPermissionToAllGroups(mb.api);
      await setUserAsAnalyst(mb.api, NORMAL_USER_ID, false);

      await mb.signInAsNormalUser();
      await page.goto("/data-studio/transforms");
      await expect(page).toHaveURL(/\/unauthorized/);
      await expect(DataStudio.Transforms.list(page)).toHaveCount(0);
    });
  });
});

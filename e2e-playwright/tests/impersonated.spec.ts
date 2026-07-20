/**
 * Playwright port of e2e/test/scenarios/permissions/impersonated.cy.spec.js
 *
 * Two tests, both exercising connection impersonation against the QA Postgres
 * 12 container: a user whose `role` login attribute maps to a postgres role
 * granted only Orders+Products must be denied `reviews` through the query
 * builder, through the native editor, and — the second test — through a
 * PRE-WARMED QUERY CACHE populated by an admin who *does* have access.
 *
 * === Infra tier (measured, not inferred from the tag) ===
 * The whole file is `@external`: every test restores the `postgres-12`
 * snapshot AND calls `createTestRoles({type:"postgres"})`, which opens a real
 * connection to postgres://localhost:5404 to CREATE ROLE. Neither test can run
 * without the container, so the gate sits in the outermost `beforeEach`.
 * Gated on PW_QA_DB_ENABLED, not QA_DB_ENABLED (the latter leaks truthy from
 * cypress.env.json on dev machines). The upstream describe has NO `afterEach`,
 * so a `beforeEach`-level skip is safe here — nothing needs to unwind.
 *
 * === Token ===
 * `H.activateToken("pro-self-hosted")`. The predicate is real and traced:
 * `impersonation-enforced-for-db?` and `impersonated-user?`
 * (enterprise/backend/src/metabase_enterprise/impersonation/util.clj) are
 * `defenterprise ... :feature :advanced-permissions`, and
 * `set-role-if-supported!` (impersonation/driver.clj) is gated the same way.
 * Without the feature the OSS fallback returns false and NO ROLE IS SET — the
 * impersonated user would read `reviews` fine. See findings-inbox for the
 * two-arm control. `restore()` resets `premium-embedding-token`, so the token
 * is re-activated per test and never leaks past the file.
 *
 * === The defect this spec's constants can hide ===
 * See the long note in support/impersonated.ts: a wrong COLLECTION_GROUP id
 * leaves the impersonated user with an unrestricted grant from another group,
 * which SUPERSEDES the impersonation policy. The spec then goes green while
 * enforcing nothing. `assertGroupIds` + `assertPgDbId` re-derive both ids from
 * the live instance by name in the beforeEach, and the two tests below carry
 * explicit "impersonation is actually in force" anchors.
 *
 * === Fidelity notes ===
 * - `cy.findAllByTestId("header-cell").contains("Subtotal")` is CASE-SENSITIVE
 *   substring matching, and the casing is load-bearing: the MBQL result column
 *   is "Subtotal" while the native postgres result column is lowercase
 *   "subtotal". Playwright's `hasText` with a STRING is case-INSENSITIVE, so
 *   both are ported as regexes (`/Subtotal/`, `/subtotal/`), which preserves
 *   case sensitivity. A string would have made the two assertions
 *   interchangeable and stopped distinguishing the two code paths.
 * - `cy.wait("@query")` pops a QUEUE that includes responses which already
 *   arrived. Ported as `page.waitForResponse` promises created BEFORE the
 *   action that triggers them, which is the same ordering guarantee without
 *   the replay semantics.
 * - Upstream asserts the error text with a bare `cy.findByText(...)` (no
 *   `.should`). `findByText` throws when absent, so it is a real assertion, not
 *   a no-op — ported as `toBeVisible()`.
 */
import {
  IMPERSONATED_ROLE,
  IMPERSONATED_USER_EMAIL,
  PG_DB_ID,
  PG_DB_NAME,
  assertGroupIds,
  assertPgDbId,
  assertRunsAs,
  getImpersonations,
  setImpersonatedPermission,
  signInAsImpersonatedUser,
} from "../support/impersonated";
import { expect, test } from "../support/fixtures";
import { openQuestionActions, runNativeQuery } from "../support/models";
import {
  startNewNativeQuestion,
  typeInNativeEditor,
} from "../support/native-editor";
import {
  cacheStrategySidesheet,
  selectCacheStrategy,
} from "../support/performance-caching";
import { saveQuestion } from "../support/sharing";
import { QA_DB_SKIP_REASON, createTestRoles } from "../support/view-data-permissions";

const ADMIN_EMAIL = "admin@metabase.test";

/** Port of the spec's `cy.get("main")`. */
const main = (page: import("@playwright/test").Page) => page.locator("main");

test.describe("impersonated permission", () => {
  test.describe("admins", () => {
    test.beforeEach(async ({ mb }) => {
      // Gate at the outermost beforeEach: the upstream describe has no
      // afterEach, so skipping here unwinds nothing.
      test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

      await mb.restore("postgres-12");
      await createTestRoles();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
    });

    test.describe("impersonated users", () => {
      test.beforeEach(async ({ mb }) => {
        // Upstream repeats the whole outer beforeEach here (restore →
        // createTestRoles → signInAsAdmin → activateToken) before setting the
        // permission. Kept verbatim rather than deduplicated: `restore` resets
        // the token and the permission graph, so collapsing the two would
        // change what state the permission write lands on.
        await mb.restore("postgres-12");
        await createTestRoles();
        await mb.signInAsAdmin();
        await mb.api.activateToken("pro-self-hosted");

        // Prove the API is bound to admin BEFORE the graph write. A permission
        // graph written as the wrong user is the silent-no-op failure mode.
        const admin = await assertRunsAs(
          mb.api,
          ADMIN_EMAIL,
          "beforeEach: permission-graph write",
        );
        expect(admin.is_superuser).toBe(true);

        // Re-derive both group ids and the db id from the live instance by
        // name, so a renumbered snapshot fails loudly instead of quietly
        // disabling impersonation.
        await assertGroupIds(mb.api);
        await assertPgDbId(mb.api);

        await setImpersonatedPermission(mb.api);

        // Positive anchor: the impersonation policy is actually installed.
        // Without this, both tests could go green on a graph write that the
        // backend silently dropped.
        const impersonations = await getImpersonations(mb.api);
        expect(
          impersonations,
          "the impersonation policy must be installed before the test runs",
        ).toContainEqual(
          expect.objectContaining({ db_id: PG_DB_ID, attribute: "role" }),
        );
      });

      test("have limited access", async ({ page, mb }) => {
        await signInAsImpersonatedUser(mb);

        // Proof of identity: everything below must run as the impersonated
        // user, not as the admin the beforeEach left behind.
        const user = await assertRunsAs(
          mb.api,
          IMPERSONATED_USER_EMAIL,
          "test body",
        );
        expect(user.is_superuser).toBe(false);

        await page.goto(`/browse/databases/${PG_DB_ID}`);

        // No access through the visual query builder
        await main(page).getByText("Reviews", { exact: true }).click();
        await expect(
          page.getByText("There was a problem with your question", {
            exact: true,
          }),
        ).toBeVisible();
        await page.getByText("Show error details", { exact: true }).click();
        await expect(
          page.getByText("ERROR: permission denied for table reviews", {
            exact: true,
          }),
        ).toBeVisible();

        // Has access to allowed tables
        await page.goto(`/browse/databases/${PG_DB_ID}`);

        await main(page).getByText("Orders", { exact: true }).click();
        // Case-sensitive on purpose: the MBQL display name is "Subtotal".
        await expect(
          page.getByTestId("header-cell").filter({ hasText: /Subtotal/ }),
        ).toHaveCount(1);

        await page.reload();

        // No access through the native query builder
        await startNewNativeQuestion(page);

        await page.getByTestId("gui-builder-data").click();
        await page.getByLabel(PG_DB_NAME).click();
        await typeInNativeEditor(page, "select * from reviews");
        await runNativeQuery(page);

        const queryBuilderMain = page.getByTestId("query-builder-main");
        await expect(
          queryBuilderMain.getByText("An error occurred in your query", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          queryBuilderMain.getByText(
            "ERROR: permission denied for table reviews",
            { exact: true },
          ),
        ).toBeVisible();

        // Has access to other tables
        // Port of NativeEditor.type("{selectall}{backspace}") — select the
        // editor contents and delete, then type the replacement. `cy.type`
        // appends at the caret; `pressSequentially` would insert at offset 0,
        // so the editor is explicitly cleared first.
        await page.locator("[data-testid=native-query-editor] .cm-content").click();
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.press("Backspace");
        await typeInNativeEditor(page, "select * from orders", { focus: false });

        await runNativeQuery(page);

        // Case-sensitive on purpose: postgres returns the column lowercased.
        await expect(
          page.getByTestId("header-cell").filter({ hasText: /subtotal/ }),
        ).toHaveCount(1);

        // === STRENGTHENING BEYOND UPSTREAM (declared) ===
        // Upstream proves impersonation only through the DENIAL text. That is
        // one proxy, and a denial is a shape many unrelated failures produce:
        // with the token absent the very same flow denies `reviews` too, but
        // with "You do not have permissions to run this query" (a Metabase-level
        // 403) rather than postgres's "permission denied for table reviews".
        //
        // This adds a second, INDEPENDENT and POSITIVE proxy: ask postgres who
        // it thinks it is. `orders_products_access` can only appear if
        // `set-role-if-supported!` actually assumed the role named by the
        // user's `role` login attribute — i.e. impersonation is genuinely in
        // force, not merely that something, somewhere, said no.
        const roleResponse = await mb.api.post("/api/dataset", {
          database: PG_DB_ID,
          type: "native",
          native: { query: "select current_user" },
        });
        const roleBody = (await roleResponse.json()) as {
          data: { rows: string[][] };
        };
        expect(
          roleBody.data.rows,
          "postgres must report the impersonated role, proving the role was assumed",
        ).toEqual([[IMPERSONATED_ROLE]]);
      });

      test("caching should not circumvent impersonation permissions", async ({
        page,
        mb,
      }) => {
        // This test runs the setup as ADMIN (who can read `reviews`), which is
        // the whole point: the cache is primed with privileged results.
        await assertRunsAs(mb.api, ADMIN_EMAIL, "caching test setup");

        // create a question for a table the impersonated user does not have
        // access to
        await startNewNativeQuestion(page);
        await page.getByTestId("gui-builder-data").click();
        await page.getByLabel(PG_DB_NAME).click();
        await typeInNativeEditor(page, "select * from reviews");
        await runNativeQuery(page);

        await saveQuestion(page, "foo", {
          path: ["Our analytics", "First collection"],
        });

        // configure caching
        await openQuestionActions(page, "Edit settings");
        await page.getByLabel("When to get new results").click();
        await expect(
          cacheStrategySidesheet(page).getByText(/Caching settings/),
        ).toBeVisible();
        await selectCacheStrategy(page, /Duration/);
        await cacheStrategySidesheet(page)
          .getByRole("button", { name: /Save/ })
          .click();

        // prime and assert results are cached
        const isCardQuery = (response: import("@playwright/test").Response) =>
          response.request().method() === "POST" &&
          /^\/api\/card\/\d+\/query$/.test(new URL(response.url()).pathname);

        // load once to warm cache
        let query = page.waitForResponse(isCardQuery);
        await page.reload();
        await expect(
          page.getByTestId("header-cell").filter({ hasText: /reviewer/ }),
        ).toHaveCount(1);
        const uncached = (await (await query).json()) as { cached: unknown };
        expect(uncached.cached).toBe(null);

        // load again to hit cache
        query = page.waitForResponse(isCardQuery);
        await page.reload();
        await expect(
          page.getByTestId("header-cell").filter({ hasText: /reviewer/ }),
        ).toHaveCount(1);
        const cached = (await (await query).json()) as { cached: unknown };
        expect(typeof cached.cached).toBe("string");

        // switch to impersonated user
        await mb.signOut();
        await signInAsImpersonatedUser(mb);
        await assertRunsAs(
          mb.api,
          IMPERSONATED_USER_EMAIL,
          "after switching users",
        );

        // wait for the reloaded query to return before asserting the error UI,
        // since under load the page can outlast the default assertion timeout
        query = page.waitForResponse(isCardQuery);
        await page.reload();
        await query;

        // check that impersonation enforcement occurs
        const queryBuilderMain = page.getByTestId("query-builder-main");
        await expect(
          queryBuilderMain.getByText("An error occurred in your query", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          queryBuilderMain.getByText(
            "ERROR: permission denied for table reviews",
            { exact: true },
          ),
        ).toBeVisible();
      });
    });
  });
});

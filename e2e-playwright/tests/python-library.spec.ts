/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/transforms/python-library.cy.spec.ts
 *
 * Upstream is 57 lines: one `describe` with one `it`. Everything is ported;
 * nothing is dropped, merged or weakened.
 *
 * ─────────────────────── THE "PYTHON IS BLOCKED" CLAIM ───────────────────────
 * The porting brief predicted this tier would be blocked, for two reasons. Both
 * were probed against this slot's backend (:4103) rather than inherited:
 *
 *  1. "Python goes through `python-transforms-enabled?`, which needs
 *     `transforms-basic`, which is false on the local token."  → **FALSE for
 *     this spec.** `GET/PUT /api/ee/transforms-python/library/:path` never call
 *     `transforms/crud.clj:check-feature-enabled!` at all (read the endpoint:
 *     the PUT's only guard is `perms/has-any-transforms-permission?`). Their
 *     gate is the route mount in
 *     `enterprise/backend/src/metabase_enterprise/api_routes/routes.clj:144`:
 *         "/transforms-python" (premium-handler …/routes :transforms-python)
 *     i.e. the `transforms-python` feature, NOT `transforms-basic`. Measured on
 *     :4103 — no token: GET/PUT both **402**; after `pro-self-hosted`:
 *     `transforms-python=true` (with `transforms-basic` still false) and GET/PUT
 *     both **200**. So the token gate is REAL and load-bearing here, and the
 *     specific mechanism the brief named is not the one that applies.
 *
 *  2. "localstack :4566 is down."  → **TRUE but INAPPLICABLE.** :4566 and the
 *     python-runner :5001 were both probed and are both down. Neither is on any
 *     path this spec drives: the library is a pure CRUD/editor surface backed by
 *     the app DB (`models/python_library.clj`). Only `POST …/test-run` and real
 *     python transform *execution* need S3 + the runner, and this spec does
 *     neither. `H.setPythonRunnerSettings()` is not called upstream.
 *
 * Net: this spec EXECUTES. 1 of 1 test executed, 0 unexecuted, 0 fixme.
 *
 * ───────────────────────────── QA DATABASE TIER ─────────────────────────────
 * Upstream restores `postgres-writable` and resets the `many_schemas` table, so
 * this needs the writable QA postgres (:5404, probed UP) — gated on
 * PW_QA_DB_ENABLED like the sibling transforms ports. The SQL transform in the
 * beforeEach exists only to make the "Python library" row appear in the list.
 *
 * ──────────────────────────────── SNOWPLOW ──────────────────────────────────
 * VANTAGE: the BROWSER BOUNDARY. The only event-emitting code on this path is
 * frontend-emitted (`frontend/src/metabase/transforms/analytics.ts`); a grep for
 * backend emission across the transforms modules finds none. FE events cannot
 * reach the per-slot collector anyway — its preflight omits
 * `Access-Control-Allow-Credentials`, so the tracker's credentialed POST dies
 * `net::ERR_FAILED`. This is NOT dead setup that can be no-op'd: upstream's
 * `afterEach` runs a real (if weak) assertion, so it is ported to the structural
 * stand-in in support/search-snowplow.ts. Cost stated plainly: without
 * snowplow-micro, `expectNoBadSnowplowEvents` degrades from "no event failed
 * Iglu validation" to "no payload failed to decode into a well-formed
 * self-describing envelope". Strictly weaker; recorded, not hidden.
 *
 * ───────────────────────────────── PORT NOTES ────────────────────────────────
 * - The two help comments are NOT a CodeMirror placeholder despite upstream's
 *   `cy.log("make sure placeholder …")`. `EMPTY_LIBRARY_SOURCE` in
 *   PythonLibraryEditorPage.tsx is the editor's `value`, so they are real
 *   document lines. The assertions are ported as written; the log's wording is
 *   wrong upstream and is corrected in a comment rather than by changing the
 *   assertion.
 * - CodeMirror autocomplete hazard (`@codemirror/autocomplete`'s 75ms
 *   `interactionDelay`, where a refused Enter falls through to `insertNewline`)
 *   is INAPPLICABLE here: the typed string contains no Enter. `withPandasCompletions`
 *   is on, but `print('hello world')` accepts no completion.
 * - `pressSequentially` inserts at the caret, and the caret is set by the
 *   preceding `.click()` — exactly as upstream's `.click().realType()` does.
 *   The click is NOT replaced by a helper that seeks the end of the document:
 *   that would change where the text lands relative to upstream.
 * - `cy.url().reload()` is just `cy.reload()` — `reload` is a parent command and
 *   ignores the `cy.url()` subject. Ported as a page reload.
 * - `resetTransformTargetTables()` has no upstream counterpart. The writable
 *   postgres is long-lived and shared across slots, so a leftover
 *   `"Schema A"."table_a"` makes `createSqlTransform` 403 on the physical
 *   already-exists check. This restores the clean-warehouse precondition CI
 *   gets for free; it changes no assertion.
 */
import { expect, test } from "../support/fixtures";
import {
  DataStudio,
  QA_DB_SKIP_REASON,
  createSqlTransform,
  resetTransformTargetTables,
} from "../support/transforms";
import { resetManySchemasTable } from "../support/transforms-codegen";
import {
  type SnowplowCapture,
  expectNoBadSnowplowEvents,
  installSnowplowCapture,
} from "../support/search-snowplow";
import { undoToast } from "../support/transforms-indexes";

test.describe("scenarios > data studio > transforms > python library", () => {
  // The describe has an afterEach, so the QA-DB gate must be applied at DESCRIBE
  // level: a `test.skip()` inside the body would let beforeEach run (and activate
  // a token) before skipping.
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  let capture: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore("postgres-writable");
    await resetManySchemasTable();
    await resetTransformTargetTables();
    // H.resetSnowplow() — the capture is installed fresh per test below, which
    // is what "reset" means at this vantage.
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
    capture = await installSnowplowCapture(page, mb.baseUrl);
    // Python library row only appears when we have at least one transform
    await createSqlTransform(mb.api, {
      sourceQuery: "SELECT 1",
      targetTable: "table_a",
      targetSchema: "Schema A",
    });
  });

  test.afterEach(() => {
    // H.expectNoBadSnowplowEvents() — structural stand-in (no snowplow-micro,
    // so no Iglu schema validation; see support/search-snowplow.ts).
    expectNoBadSnowplowEvents(capture);
  });

  test("should allow editing the python library", async ({ page }) => {
    await DataStudio.Transforms.visit(page);
    await page.getByRole("link", { name: /Python library/ }).click();

    const editor = DataStudio.PythonLibrary.editor(page);
    await expect(editor).toBeVisible();

    // make sure placeholder with help comment is displayed
    //
    // (Upstream calls it a "placeholder"; it is really the editor's initial
    // value — `EMPTY_LIBRARY_SOURCE`. The assertions are unchanged.)
    await expect(
      editor.getByText(/# This is your Python library/),
    ).toBeVisible();
    await expect(
      editor.getByText(/# You can add functions and classes here/),
    ).toBeVisible();

    // modify and save the python library
    const textbox = editor.getByRole("textbox");
    await textbox.click();
    await textbox.pressSequentially("print('hello world')");

    const saveButton = page.getByRole("button", { name: "Save" });
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    await expect(undoToast(page).getByText(/Python library saved/)).toBeVisible();

    // refresh the page and check the content is persisted
    await page.reload();

    await expect(editor.getByText(/hello world/)).toBeVisible();
  });
});

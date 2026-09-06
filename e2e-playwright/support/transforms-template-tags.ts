/**
 * Helpers for the transforms template-tags spec port
 * (e2e/test/scenarios/data-studio/transforms/template-tags.cy.spec.ts, 382 lines,
 * 3 tests in one describe).
 *
 * Support-module name: `support/transforms-template-tags.ts` — the exact
 * basename of the source spec, per the brief's requirement. No pre-existing
 * module of this name; nothing collided.
 *
 * ============================ TOKEN TIER — TRACED ============================
 * The queue tags this file `token`. Traced through the source and then PROBED
 * LIVE on :4103 rather than inherited from a sibling, because the brief records
 * three different answers reached by the same method on neighbouring files.
 *
 * `transforms/crud.clj:40 check-feature-enabled!` -> `transforms/util.clj:37
 * check-feature-enabled`, which DISPATCHES ON SOURCE TYPE:
 *
 *   (cond
 *     (query-transform?  transform) (premium-features/query-transforms-enabled?)
 *     (python-transform? transform) (premium-features/python-transforms-enabled?)
 *     :else false)
 *
 *   ;; token_check.clj:715
 *   (defn query-transforms-enabled? []
 *     (and (setting/get :transforms-enabled)
 *          (or (not (is-hosted?)) (has-feature? :transforms-basic))))
 *
 * EVERY transform this spec creates is a `query` transform — there is no python
 * anywhere in the file (test 1 never saves a transform at all; test 2 creates
 * one via `POST /api/transform` with `source.type = "query"`; test 3 creates one
 * through the "SQL query" editor, which is also `source.type = "query"`). So the
 * ONLY predicate this spec can reach is `query-transforms-enabled?`, and its
 * `or` short-circuits on `(not is-hosted?)`.
 *
 * Measured on :4103 (no token value is reproduced anywhere, per the brief):
 *   version.hash 751c2a9 vs target/uberjar/COMMIT-ID 751c2a98  (identity match)
 *   is-hosted?        false      <- the branch that makes the token irrelevant
 *   token features ON 42
 *   transforms-basic  FALSE      <- genuinely absent, and genuinely unread here
 *   transforms-python true
 *
 * End-to-end probe, WRITABLE_DB_ID = 2, before a line of the port was written:
 *   PUT  /api/setting/transforms-enabled  {"value":true}          -> 204
 *   POST /api/testing/native-query {database:2, query:"SELECT 1"} -> 200
 *   POST /api/transform  (source.type "query", table target)      -> 200
 *   POST /api/transform/:id/run                                   -> 202,
 *        last_run.status = "succeeded"
 *   DELETE /api/transform/:id/table -> 204 ; DELETE /api/transform/:id -> 204
 *
 * So `H.activateToken("pro-self-hosted")` in the upstream beforeEach is NOT
 * load-bearing for this file on a non-hosted instance. It is kept in the port
 * (faithfulness — dropping setup is dropping a test's preconditions), and the
 * claim is backed by an explicit token-OFF control run reported in
 * findings-inbox/transforms-template-tags.md.
 *
 * Checked too, since it is the obvious way this could still bite: the EE
 * frontend sets `PLUGIN_TRANSFORMS.isEnabled = !!hasPremiumFeature("transforms-basic")`
 * (enterprise/frontend/src/metabase-enterprise/transforms/index.ts:9), and
 * `transforms-basic` is FALSE here. That looked like it would render the
 * transforms upsell page instead of the editor. It does not: grepping every
 * reader of `PLUGIN_TRANSFORMS.isEnabled` finds exactly two call sites —
 * `SmartLinkNode.tsx:346` (a document smart-link fetch) and
 * `DataPermissionsHelp.tsx:203` (a help-text paragraph). Neither is on the
 * Data Studio transform routes (`frontend/src/metabase/transforms/routes.tsx`
 * gates only the PYTHON routes/tabs, via PLUGIN_TRANSFORMS_PYTHON). Recorded
 * because "the flag is false" is true but "the flag blocks this spec" is not.
 * =============================================================================
 *
 * SNOWPLOW — the queue also tags this file `snowplow`. That tag is DEAD SETUP.
 * The upstream beforeEach calls `H.resetSnowplow()` and the file then makes
 * ZERO snowplow assertions: no `expectUnstructuredSnowplowEvent`, no
 * `expectGoodSnowplowEvents`, no `expectNoBadSnowplowEvents`, and no `afterEach`
 * at all (grep for `snowplow` in the source returns exactly one line, the reset).
 * Neither vantage is therefore ported — not the browser boundary
 * (`installSnowplowCapture`) and not the per-slot collector — because there is
 * nothing to observe. See the findings file for the full reasoning; this is the
 * "dead setup" failure mode the brief warns the gate column can produce, not a
 * decision between the two vantages.
 *
 * QA-DATABASE TIER. Restores `postgres-writable`, resets `many_schemas`, drives
 * WRITABLE_DB_ID (writable postgres on :5404). Gated on PW_QA_DB_ENABLED, and
 * this port EXECUTES when the gate is on — a green all-skipped run is the
 * failure mode, not the goal (FINDINGS #49).
 *
 * New module (PORTING rule 9). Shared support modules are imported read-only
 * and never edited.
 */
import { type Locator, type Page, expect } from "@playwright/test";

import { queryWritableDB } from "./schema-viewer";
import { DataStudio } from "./transforms";

// ---------------------------------------------------------------------------
// Constants (from the spec header)
// ---------------------------------------------------------------------------

export const DB_NAME = "Writable Postgres12";
export const SOURCE_TABLE = "Animals";
export const TARGET_SCHEMA = "Schema A";

/**
 * ⚠️ DELIBERATE DEVIATION FROM UPSTREAM, declared rather than smuggled.
 *
 * Upstream sets `TARGET_TABLE = "transform_table"`. That literal is actively
 * unsafe in this harness, and the evidence is not hypothetical: an inventory of
 * the shared writable container taken before this port began already contained
 *
 *     Schema A.transform_table
 *
 * i.e. a LIVE fixture belonging to the already-landed sibling
 * `tests/transforms.spec.ts`. Using the same name would (a) 403 this spec's
 * `POST /api/transform` on the physical "a table with that name already exists"
 * guard, and (b) put this spec's target inside the blast radius of that
 * sibling's `resetTransformTargetTables()`, which runs
 *
 *     ... WHERE table_schema IN ('Schema A','Schema B','Domestic','Wild','public')
 *           AND lower(table_name) LIKE '%transform%'   -> DROP TABLE CASCADE
 *
 * against the same container all five slots share. Any name still containing
 * the substring "transform" is caught by that LIKE, so the replacement
 * deliberately omits it.
 *
 * Nothing is weakened: `TARGET_TABLE` is never the SUBJECT of an assertion in
 * this spec. It appears once, inside the `target` map of the API-created
 * transform in test 2, and is never read back or displayed. Every assertion in
 * that test is about template-tag UI state and the run outcome, both of which
 * are independent of the target's name.
 *
 * CI is unaffected either way — it provisions the writable container per job.
 */
export const TARGET_TABLE = "tt_tag_target";

/**
 * ⚠️ SECOND DELIBERATE DEVIATION, same reasoning, declared.
 *
 * Upstream test 3 types `"Foo"` into the save modal's name field. The save
 * modal auto-derives the TARGET TABLE NAME from the transform name (measured on
 * the sibling incremental port: name "MBQL" -> table "mbql"), and test 3 then
 * RUNS the transform, so upstream materialises a physical table literally named
 * `foo` in the shared container — in the `Domestic` schema, since the new-
 * transform save modal exposes no schema control and the app does NOT default
 * the target to the source schema.
 *
 * `foo` is exactly the kind of generic name the brief warns about: this spec
 * would be unable to clean it up without risking a sibling's fixture, and a
 * sibling's substring sweep could equally take it out mid-run. The literal is
 * never asserted — it is typed into a name field twice and read back never — so
 * a distinctive value is observationally identical and cleanable by exact name.
 */
export const TRANSFORM_NAME = "TTFoo";

/** The table `TRANSFORM_NAME` auto-derives into, needed only for cleanup. */
export const TRANSFORM_TARGET_TABLE = "ttfoo";

export const QA_DB_SKIP_REASON =
  "Requires the writable postgres QA container + the postgres-writable snapshot (set PW_QA_DB_ENABLED)";

// ---------------------------------------------------------------------------
// Warehouse fixtures
// ---------------------------------------------------------------------------

/**
 * Drop the physical tables this spec's transforms write into.
 *
 * No counterpart upstream. The transform "table already exists" guard is a
 * PHYSICAL check against the warehouse, and the app-DB snapshot restore in the
 * beforeEach cannot clear it. Upstream tolerates the residue because CI
 * provisions the writable container fresh per job; the local container is
 * long-lived and shared across sessions and agents.
 *
 * #85 compliance: this drops TWO EXACT TABLE NAMES, both chosen above to be
 * unique to this spec, and NEVER drops a schema. It does not use a LIKE
 * pattern, precisely because a sibling's `%transform%` pattern is what made the
 * upstream names unusable in the first place. Foreign schemas and siblings'
 * tables are untouched.
 *
 * The name-across-all-schemas form (rather than a guessed schema) is
 * deliberate: `TRANSFORM_TARGET_TABLE` lands in `Domestic`, not in the source
 * schema, and `TARGET_TABLE` lands in `Schema A`. Keying on the name covers
 * both without encoding a guess.
 */
export async function resetTemplateTagTargetTables() {
  await queryWritableDB(`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_name IN ('${TARGET_TABLE}', '${TRANSFORM_TARGET_TABLE}')
      LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', r.table_schema, r.table_name);
      END LOOP;
    END $$;
  `);
}

// ---------------------------------------------------------------------------
// Spec-local getters (template-tags.cy.spec.ts:349-382)
// ---------------------------------------------------------------------------

/** Port of `visitTransformListPage()`: cy.visit("/data-studio/transforms"). */
export const visitTransformListPage = (page: Page) =>
  page.goto("/data-studio/transforms");

/**
 * Upstream's spec-local `queryEditor()` (cy.findByTestId("transform-query-editor"))
 * is only ever used as `queryEditor().button("Save")`. That exact composition
 * already exists as the shared `DataStudio.Transforms.saveChangesButton`, so the
 * spec uses that rather than re-deriving it. Noted here so the mapping from the
 * upstream helper is explicit rather than missing.
 */

/** Port of `editorSidebar()`: cy.findByTestId("editor-sidebar"). */
export const editorSidebar = (page: Page): Locator =>
  page.getByTestId("editor-sidebar");

/**
 * Port of `getRunButton()`: cy.findAllByTestId("run-button").eq(0).
 * (Upstream threads a `timeout` option through `.eq()`, where it has no effect —
 * `.eq` is a query, not a retried assertion. Dropped as inert.)
 */
export const getRunButton = (page: Page): Locator =>
  DataStudio.Transforms.runButton(page);

/** The native editor's action-button cluster (data reference / snippets / preview). */
export const nativeEditorActionButtons = (page: Page): Locator =>
  page.getByTestId("native-query-editor-action-buttons");

/** The native editor's top bar (holds the "Variables" toggle). */
export const nativeQueryTopBar = (page: Page): Locator =>
  page.getByTestId("native-query-top-bar");

/** `H.undoToast()`: cy.findByTestId("toast-undo"). */
export const undoToast = (page: Page): Locator => page.getByTestId("toast-undo");

/**
 * Dismiss the undo toast and WAIT FOR IT TO GO.
 *
 * 🔴 Not cosmetic. `UndoListing.tsx:203` picks its transition group with
 * `"Cypress" in window ? MockGroup : TransitionGroup`, so exit transitions are
 * disabled ONLY under Cypress. Under Playwright a dismissed toast lingers
 * through its exit animation, and the next `getByTestId("toast-undo")` in the
 * same sub-scenario resolves to 2 elements and dies on strict mode. This spec
 * dismisses a toast up to twice per sub-scenario across six sub-scenarios, so
 * it would hit that on essentially every test.
 *
 * The fix is to gate on `toHaveCount(0)` — NOT to loosen the locator to
 * `.first()`, which would silently accept a stale toast and make the NEXT
 * assertion read the wrong element.
 */
export async function dismissUndoToast(page: Page) {
  await undoToast(page).locator(".Icon-close").click();
  await expect(page.getByTestId("toast-undo")).toHaveCount(0);
}

/**
 * Port of `H.NativeEditor.value()` (e2e-codemirror-helpers.ts:145).
 *
 * The Cypress helper collects every `.cm-line`'s textContent, skipping lines
 * that contain a `.cm-placeholder`, and joins with "\n".
 *
 * TWO details preserved deliberately:
 *
 * 1. RAW `textContent`, not `toHaveText`. `toHaveText` normalizes whitespace,
 *    and the value asserted here is `"{{snippet: snippet1}}"` — a string whose
 *    interior space is part of what is being checked. Normalization happens to
 *    be a no-op for this particular value, but reading raw keeps the assertion
 *    about the editor's literal contents rather than about a normalized view.
 *
 * 2. Upstream's `helpers.textbox().get(".cm-line")` is a `cy.get`, which
 *    RE-QUERIES FROM THE DOCUMENT ROOT and therefore discards the `.cm-content`
 *    subject entirely — the brief's "helper discards its arguments" hazard. On
 *    the transform editor page there is exactly one CodeMirror instance, so
 *    document-wide and editor-scoped are the same set. This port scopes to the
 *    native query editor, which is what upstream MEANS; the divergence is noted
 *    rather than hidden, and it is a strengthening only in the sense that a
 *    second editor appearing on the page would break upstream and not this.
 */
export async function nativeEditorValue(page: Page): Promise<string> {
  return page
    .locator("[data-testid=native-query-editor] .cm-content .cm-line")
    .evaluateAll((lines) =>
      lines
        .filter((line) => !line.querySelector(".cm-placeholder"))
        .map((line) => line.textContent ?? "")
        .join("\n"),
    );
}

/** Assert `H.NativeEditor.value()` equals `expected`, retried. */
export async function expectNativeEditorValue(page: Page, expected: string) {
  await expect
    .poll(() => nativeEditorValue(page), { timeout: 15_000 })
    .toBe(expected);
}

/**
 * 🔴 Faithful port of testing-library's `findByText(string)` — which is NOT
 * `getByText(string, { exact: true })`.
 *
 * MEASURED divergence, and it broke this port on the first run:
 *
 *   <div>Default value<span>(required)</span></div>
 *
 * `H.editorSidebar().findByText("Default value")` MATCHES that div. Testing-
 * library's matcher runs against `getNodeText(node)`, which concatenates only
 * the node's DIRECT CHILD TEXT NODES — so the `(required)` span is invisible to
 * it. Playwright's `getByText(..., { exact: true })` compares the element's FULL
 * normalized `textContent`, which is `"Default value (required)"`, so it matches
 * nothing and times out. That is exactly what happened at spec:261 on run 1.
 *
 * (Note this is the mirror image of how the brief states the hazard — the brief
 * has Playwright doing direct-child text nodes and Cypress doing full
 * textContent. It is the other way round. Recorded as a correction, on
 * evidence: the run-1 call log shows Playwright's exact matcher failing on a DOM
 * where testing-library's succeeds.)
 *
 * The XPath below selects elements whose direct text node normalizes to the
 * target. It cannot match an ancestor, because an ancestor's `text()` does not
 * include its descendants' text — so it is precise, not merely permissive, and
 * it is a strictly closer reproduction of upstream than either Playwright form.
 *
 * Small known gap, stated: XPath 1.0's `text()` in a string comparison takes the
 * FIRST direct text node, where testing-library joins ALL of them. They differ
 * only for an element with text nodes on both sides of a child element; no
 * label in this spec has that shape.
 */
export function directText(scope: Page | Locator, text: string): Locator {
  return scope.locator(
    `xpath=.//*[normalize-space(text()) = ${xpathLiteral(text)}]`,
  );
}

/** Quote a string for XPath 1.0, which has no escape syntax. */
function xpathLiteral(value: string): string {
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  return `concat(${value
    .split('"')
    .map((part) => `"${part}"`)
    .join(`, '"', `)})`;
}

/**
 * Port of `assertNoParameterSettingsAreVisible()` (spec:374-382).
 *
 * Five `should("not.exist")` checks, scoped to the editor sidebar by upstream's
 * `.within()`. Ported as `toHaveCount(0)` (retried, per the brief's note that
 * this is the right form) rather than `toBeHidden()`, which would drop the
 * existence check these assertions are entirely about.
 *
 * Uses `directText` rather than `getByText(exact)` so the ABSENCE being asserted
 * is absence under upstream's own matcher — a `not.exist` check ported with a
 * narrower matcher would pass more easily than upstream's, which is the one
 * direction that must not drift.
 */
export async function assertNoParameterSettingsAreVisible(page: Page) {
  const sidebar = editorSidebar(page);
  for (const text of [
    "How should users filter on this variable?",
    "People can pick",
    "Time grouping options",
    "Parameter widget label",
    "Filter widget label",
  ]) {
    await expect(directText(sidebar, text)).toHaveCount(0);
  }
}

/**
 * Port of `assertIsTransformRunnable()` (spec:363-368): switch to the Run tab,
 * hit run, wait for the button to settle on "Ran successfully", switch back.
 *
 * The run is a REAL round trip to the writable warehouse (create-or-replace the
 * target table, then sync), so the wait needs materially more headroom than the
 * project's default expect timeout. Upstream leans on Cypress's own generous
 * default plus a (inert) `timeout` option; the explicit number here is the
 * equivalent, not a workaround for a flake.
 */
export async function assertIsTransformRunnable(page: Page) {
  await DataStudio.Transforms.runTab(page).click();
  await getRunButton(page).click();
  await expect(getRunButton(page)).toHaveText("Ran successfully", {
    timeout: 120_000,
  });
  await DataStudio.Transforms.definitionTab(page).click();
}

/**
 * Type into an input the way Cypress `.type()` does: APPEND at the end of any
 * existing value.
 *
 * 🔴 `pressSequentially` after a `fill()` — or into a field whose caret has not
 * been placed — inserts at index 0, i.e. PREPENDS, and the resulting failure
 * surfaces assertions later. Upstream types `"Foo"` into the save modal's name
 * field twice (the first attempt is cancelled with "Back"), so whether the
 * field retains its value between the two decides between "TTFoo" and
 * "TTFooTTFoo" — and `fill()` would paper over a real behaviour difference
 * while `pressSequentially` alone could prepend. click + End + pressSequentially
 * reproduces Cypress's semantics exactly under either behaviour.
 */
export async function typeAppend(field: Locator, text: string) {
  await field.click();
  await field.press("End");
  await field.pressSequentially(text);
}

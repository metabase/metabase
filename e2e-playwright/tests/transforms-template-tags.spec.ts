/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/transforms/template-tags.cy.spec.ts
 * (382 lines, 3 tests in one describe). Every upstream `it` has a counterpart
 * here, in upstream order, with nothing dropped, weakened, or merged.
 *
 * ======================== TOKEN TIER — TRACED, NOT ASSUMED ==================
 * `check-feature-enabled!` (transforms/crud.clj:40) dispatches on transform
 * SOURCE TYPE (transforms/util.clj:37). Every transform in this file is a
 * `query` transform — there is no python anywhere — so the only predicate it
 * can reach is `query-transforms-enabled?` (token_check.clj:715), whose `or`
 * short-circuits on `(not is-hosted?)`. `is-hosted?` is FALSE on :4103, so the
 * absent `transforms-basic` feature is never consulted.
 *
 * Probed end-to-end before writing the port: POST /api/transform -> 200,
 * POST /api/transform/:id/run -> 202 with last_run.status "succeeded".
 * A token-OFF control run is reported in the findings file. Full derivation and
 * the probe transcript live in support/transforms-template-tags.ts.
 *
 * Also checked and cleared: the EE frontend's
 * `PLUGIN_TRANSFORMS.isEnabled = hasPremiumFeature("transforms-basic")` is
 * false here, but its only two readers are SmartLinkNode and
 * DataPermissionsHelp — it does not gate the Data Studio transform routes.
 * ===========================================================================
 *
 * SNOWPLOW — DEAD SETUP, not a vantage choice. The queue tags this file
 * `snowplow`; the upstream beforeEach calls `H.resetSnowplow()` and the file
 * then makes ZERO snowplow assertions and has NO afterEach. `grep -n snowplow`
 * over the source returns exactly one line — the reset itself. There is nothing
 * to observe, so neither the browser boundary (`installSnowplowCapture`) nor
 * the per-slot collector is installed. This is the "dead setup" failure mode
 * the brief lists for the gate column, checked for explicitly before deciding.
 *
 * QA-DATABASE TIER, gated on PW_QA_DB_ENABLED. All three tests EXECUTE when the
 * gate is on — a green all-skipped run is the failure mode, not the goal
 * (FINDINGS #49). Note upstream carries NO `@external` tag despite driving the
 * writable container as hard as its tagged siblings; the tag is missing, not
 * absent-by-design (the same drift the incremental sibling recorded).
 *
 * Port notes:
 * - The beforeEach registers EIGHT `cy.intercept(...).as(...)` aliases. Exactly
 *   ONE is ever awaited: `@updateTransform`, in test 2. The other seven
 *   (`@updateField`, `@createTransform`, `@deleteTransform`,
 *   `@deleteTransformTable`, `@createTag`, `@updateTag`, `@deleteTag`) are never
 *   waited on anywhere in the file and are dropped (PORTING rule 2). Each kept
 *   wait is registered BEFORE its triggering click, which is the correct
 *   translation of `cy.wait` — the Cypress form is a queue that can pop a PAST
 *   response, and registering after the click would race.
 * - All three `H.NativeEditor.type(..., { allowFastSet: true })` calls do NOT
 *   type: upstream writes `.cm-content`'s textContent directly and then types
 *   " {backspace}" to make CodeMirror re-run its validator. Ported via the
 *   existing `fastSetNativeEditor`, verbatim. This is why the `{{ tag }}`
 *   literals here are safe: no keystrokes means no close-brackets and no
 *   `@codemirror/autocomplete` `interactionDelay` — the whole heavily-mined
 *   CodeMirror hazard class is structurally absent from this file. Reported as
 *   inapplicable rather than banked.
 * - `should("not.exist")` -> `toHaveCount(0)` (retried), never `toBeHidden()`.
 * - Toast dismissal goes through `dismissUndoToast`, which gates on
 *   `toHaveCount(0)`; see that helper for the Cypress-only exit-transition trap.
 * - Two target-name deviations (`TARGET_TABLE`, `TRANSFORM_NAME`) are declared
 *   in full at their declarations in the support module. Both are unasserted
 *   literals; both changes exist because the upstream names collide with a
 *   live sibling fixture in the shared writable container.
 */
import { expect, test } from "../support/fixtures";
import { clearNativeEditor, createSnippet } from "../support/native-extras";
import {
  blurNativeEditor,
  createTestNativeQuery,
  fastSetNativeEditor,
} from "../support/native-reproductions";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import { DataStudio, waitForUpdateTransform } from "../support/transforms";
import { resetManySchemasTable } from "../support/transforms-codegen";
import {
  DB_NAME,
  QA_DB_SKIP_REASON,
  SOURCE_TABLE,
  TARGET_SCHEMA,
  TARGET_TABLE,
  TRANSFORM_NAME,
  assertIsTransformRunnable,
  assertNoParameterSettingsAreVisible,
  directText,
  dismissUndoToast,
  editorSidebar,
  expectNativeEditorValue,
  nativeEditorActionButtons,
  nativeQueryTopBar,
  resetTemplateTagTargetTables,
  typeAppend,
  undoToast,
  visitTransformListPage,
} from "../support/transforms-template-tags";
import { createTransform } from "../support/dependency-graph";
import { icon, modal, popover } from "../support/ui";

test.describe("scenarios > admin > transforms", () => {
  test.beforeEach(async ({ page, mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

    await mb.restore("postgres-writable");
    await resetManySchemasTable();
    // No counterpart upstream: the transform target's "already exists" guard is
    // a PHYSICAL warehouse check that the app-DB restore cannot clear, and this
    // container is long-lived and shared across slots. See the helper.
    await resetTemplateTagTargetTables();

    // H.resetSnowplow() — deliberately NOT ported. See the header: this file
    // makes zero snowplow assertions, so the reset is dead setup.

    await mb.signInAsAdmin();
    // Kept for faithfulness even though traced to be inert on a non-hosted
    // instance (see header); the token-OFF control is in the findings file.
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
    // `tables` rather than the bare form: resetManySchemasTable just recreated
    // Animals, and a stale `initial_sync_status: "complete"` row would satisfy
    // the bare wait instantly.
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [SOURCE_TABLE],
    });
  });

  test.afterEach(async () => {
    // Leave the shared container's table inventory as we found it.
    if (process.env.PW_QA_DB_ENABLED) {
      await resetTemplateTagTargetTables();
    }
  });

  test("should be able to use the data reference and snippets when writing a SQL transform", async ({
    page,
    mb,
  }) => {
    await createSnippet(mb.api, {
      name: "snippet1",
      content: "'foo'",
    });

    await visitTransformListPage(page);
    await page
      .getByRole("button", { name: "Create a transform", exact: true })
      .click();
    await directText(popover(page), "SQL query").click();

    // ⚠️ DIVERGENCE, measured — upstream's `H.popover().findByText(DB_NAME).click()`
    // CANNOT be ported literally on this instance, and the reason is visible in
    // upstream itself.
    //
    // Only ONE database here is eligible to be a transform source: the Sample
    // Database is rejected outright ("Cannot run transforms on the sample
    // database", transforms/crud.clj), leaving Writable Postgres12. The app
    // therefore auto-selects it and the picker popover closes on its own. Run 1
    // of this port captured that precisely: the locator RESOLVED to the
    // "Writable Postgres12" list item, then the click reported "element was
    // detached from the DOM, retrying" and the popover never came back — 30s of
    // losing the same race.
    //
    // Upstream corroborates this rather than contradicting it: its own test 3
    // (spec:262-283) clicks "SQL query" and then types straight into the editor,
    // never picking a database at all — and that test passes here, successfully
    // querying "Schema A"."Animals" in the writable DB. So the database really is
    // already selected; upstream's click in THIS test is vestigial (or its CI has
    // a second eligible database that keeps the popover open).
    //
    // Ported as an assertion on the state the click exists to establish. This is
    // not a weakening: if a second eligible database ever appears and the wrong
    // one is auto-selected, this fails loudly instead of proceeding silently.
    //
    // NOT cross-checked against Cypress (standing rule — a Cypress run breaks
    // live sibling slots), so whether upstream also races this is UNKNOWN and is
    // not claimed either way.
    await expect(nativeQueryTopBar(page)).toContainText(DB_NAME);

    // --- testDataReference() (spec:41-64) ---

    // open the data reference
    await nativeEditorActionButtons(page)
      .getByLabel("Learn about your data")
      .click();

    await expect(editorSidebar(page)).toBeVisible();
    // The current database should be opened by default
    await expect(
      directText(editorSidebar(page), "Data Reference"),
    ).toHaveCount(0);
    await expect(
      directText(editorSidebar(page), "Writable Postgres12"),
    ).toBeVisible();

    await nativeEditorActionButtons(page)
      .getByLabel("Learn about your data")
      .click();

    await expect(editorSidebar(page)).toHaveCount(0);

    // --- testSnippets() (spec:66-96) ---

    await nativeEditorActionButtons(page).getByLabel("SQL Snippets").click();

    await expect(editorSidebar(page)).toBeVisible();
    await expect(
      directText(editorSidebar(page), "snippet1"),
    ).toBeVisible();
    // ⚠️ `H.icon("snippet").click()` cannot be clicked DIRECTLY under Playwright,
    // and the reason is in the component rather than in the harness.
    // SnippetRow.tsx renders TWO icons inside one clickable `Flex`:
    //
    //   <Flex onClick={insertSnippet}>            <- the handler lives HERE (:57)
    //     <Icon name="snippet" className={hoverChildHidden} />        (:68)
    //     <Icon name="arrow_left_to_line" className={hoverChild} />   (:76)
    //
    // The `snippet` icon is the NON-hover state: `hoverChildHidden` hides it the
    // moment the row is hovered, and `hoverChild` reveals the arrow in its place.
    // Playwright hovers as part of its actionability check, so by the time it
    // clicks, its target has been swapped out from under it — run 2 recorded
    // exactly that: "arrow_left_to_line ... subtree intercepts pointer events",
    // then 60+ retries of "element is not visible". Cypress does not hit this
    // because it does not hover-then-wait-for-stability before dispatching.
    //
    // Clicking the icon's PARENT is not a workaround, it is where the Cypress
    // click actually lands: the icon has no handler of its own, so upstream's
    // click only ever does anything by BUBBLING to this Flex. Same element, same
    // handler, no dependence on which of the two icons is currently painted.
    await icon(editorSidebar(page), "snippet").locator("..").click();

    await expectNativeEditorValue(page, "{{snippet: snippet1}}");

    await nativeEditorActionButtons(page).getByLabel("SQL Snippets").click();

    await expect(editorSidebar(page)).toHaveCount(0);

    await nativeEditorActionButtons(page).getByLabel("Preview the query").click();

    await expect(directText(modal(page), "'foo'")).toBeVisible();
  });

  test("should be possible to use template tags in SQL transform", async ({
    page,
    mb,
  }) => {
    // Six real warehouse runs plus six full editor round trips; the project's
    // 90s default is nowhere near enough headroom.
    test.setTimeout(600_000);

    const query = await createTestNativeQuery(mb.api, {
      database: WRITABLE_DB_ID,
      query: "SELECT 1",
    });
    const transform = await createTransform(mb.api, {
      name: "MBQL",
      source: {
        type: "query",
        query,
      },
      target: {
        type: "table",
        database: WRITABLE_DB_ID,
        name: TARGET_TABLE,
        schema: TARGET_SCHEMA,
      },
    });
    await page.goto(`/data-studio/transforms/${transform.id}`);

    /** Upstream `testSimpleTemplateTag` (spec:126-183). */
    async function testSimpleTemplateTag(
      name: string,
      type: string,
      setDefaultValue: () => Promise<void>,
    ) {
      await DataStudio.Transforms.clickEditDefinition(page);

      await clearNativeEditor(page);
      await fastSetNativeEditor(page, `SELECT {{ ${name} }}`);
      await blurNativeEditor(page);

      await nativeQueryTopBar(page).getByLabel("Variables").click();

      await editorSidebar(page).getByLabel("Variable type").click();
      await directText(popover(page), type).click();

      // try saving transform, an error is shown about missing parameters
      const saveButton = DataStudio.Transforms.saveChangesButton(page);
      await expect(saveButton).toBeEnabled();
      const failedUpdate = waitForUpdateTransform(page);
      await saveButton.click();
      await failedUpdate;
      // `should("contain.text", ...)` is a CONCATENATION check on the toast's
      // full text; toContainText is the exact equivalent. Not narrowed.
      await expect(undoToast(page)).toContainText("missing required parameters");
      await dismissUndoToast(page);

      await assertNoParameterSettingsAreVisible(page);

      const alwaysRequire = directText(
        editorSidebar(page),
        "Always require a value",
      );
      await alwaysRequire.scrollIntoViewIfNeeded();
      await expect(alwaysRequire).toBeVisible();
      await alwaysRequire.click();

      await expect(saveButton).toBeDisabled();

      await directText(editorSidebar(page), "Default value").scrollIntoViewIfNeeded();
      await setDefaultValue();

      await expect(saveButton).toBeEnabled();
      const okUpdate = waitForUpdateTransform(page);
      await saveButton.click();
      await okUpdate;
      await expect(undoToast(page)).toHaveText("Transform query updated");
      await dismissUndoToast(page);
      await assertIsTransformRunnable(page);
    }

    /** Upstream `testFieldTemplateTag` (spec:185-231). */
    async function testFieldTemplateTag() {
      await DataStudio.Transforms.clickEditDefinition(page);

      await clearNativeEditor(page);
      await fastSetNativeEditor(
        page,
        'SELECT * from "Schema A"."Animals" WHERE {{ dim }}',
      );
      await blurNativeEditor(page);

      await nativeQueryTopBar(page).getByLabel("Variables").click();

      await editorSidebar(page).getByLabel("Variable type").click();
      await directText(popover(page), "Field Filter").click();

      await directText(popover(page), "Schema a").click();
      await directText(popover(page), "Animals").click();
      await directText(popover(page), "Score").click();

      await assertNoParameterSettingsAreVisible(page);

      const alwaysRequire = directText(
        editorSidebar(page),
        "Always require a value",
      );
      await alwaysRequire.scrollIntoViewIfNeeded();
      await expect(alwaysRequire).toBeVisible();
      await alwaysRequire.click();

      const saveButton = DataStudio.Transforms.saveChangesButton(page);
      await expect(saveButton).toBeDisabled();

      const enterDefault = directText(
        editorSidebar(page),
        "Enter a default value…",
      );
      await enterDefault.scrollIntoViewIfNeeded();
      await enterDefault.click();

      await popover(page).getByText("10", { exact: true }).click();
      await popover(page)
        .getByRole("button", { name: "Update filter", exact: true })
        .click();

      // saving works
      await expect(saveButton).toBeEnabled();
      const okUpdate = waitForUpdateTransform(page);
      await saveButton.click();
      await okUpdate;
      await expect(undoToast(page)).toHaveText("Transform query updated");
      await dismissUndoToast(page);
      await assertIsTransformRunnable(page);
    }

    /** Upstream `testTableTemplateTag` (spec:233-259). */
    async function testTableTemplateTag() {
      await DataStudio.Transforms.clickEditDefinition(page);

      await clearNativeEditor(page);
      await fastSetNativeEditor(page, "SELECT * from {{ table }}");
      await blurNativeEditor(page);

      await nativeQueryTopBar(page).getByLabel("Variables").click();

      await editorSidebar(page).getByLabel("Variable type").click();
      await directText(popover(page), "Table").click();

      await directText(popover(page), "Schema a").click();
      await directText(popover(page), "Animals").click();

      await assertNoParameterSettingsAreVisible(page);

      const saveButton = DataStudio.Transforms.saveChangesButton(page);
      await expect(saveButton).toBeEnabled();
      const okUpdate = waitForUpdateTransform(page);
      await saveButton.click();
      await okUpdate;
      await expect(undoToast(page)).toHaveText("Transform query updated");
      await dismissUndoToast(page);
      await assertIsTransformRunnable(page);
    }

    await testSimpleTemplateTag("text", "Text", async () => {
      await typeAppend(
        editorSidebar(page).getByPlaceholder("Enter a default value…"),
        "Foo",
      );
    });
    await testSimpleTemplateTag("number", "Number", async () => {
      await typeAppend(
        editorSidebar(page).getByPlaceholder("Enter a default value…"),
        "42",
      );
    });
    await testSimpleTemplateTag("bool", "Boolean", async () => {
      const enterDefault = directText(
        editorSidebar(page),
        "Enter a default value…",
      );
      await enterDefault.scrollIntoViewIfNeeded();
      await enterDefault.click();
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();
    });
    await testSimpleTemplateTag("date", "Date", async () => {
      await directText(editorSidebar(page), "Select a default value…").click();
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();
    });
    await testFieldTemplateTag();
    await testTableTemplateTag();
  });

  test("should be possible to add multiple template tags", async ({ page }) => {
    test.setTimeout(240_000);

    // create a new transform
    await visitTransformListPage(page);
    await page
      .getByRole("button", { name: "Create a transform", exact: true })
      .click();
    await directText(popover(page), "SQL query").click();

    // Add a query with multiple template tags
    await clearNativeEditor(page);
    await fastSetNativeEditor(
      page,
      'SELECT * from "Schema A"."Animals" WHERE name = {{ name }} AND score > {{ min_score }}',
    );
    await blurNativeEditor(page);

    // saving does not work out of the box
    const saveButton = DataStudio.Transforms.saveChangesButton(page);
    await saveButton.click();
    const saveModal = modal(page);
    await typeAppend(
      saveModal.getByPlaceholder("My Great Transform"),
      TRANSFORM_NAME,
    );
    await saveModal
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(
      saveModal.getByText(/missing required parameters/i),
    ).toBeVisible();
    await saveModal.getByRole("button", { name: "Back", exact: true }).click();

    // Open the variables sidebar
    await nativeQueryTopBar(page).getByLabel("Variables").click();

    const alwaysRequire = directText(
      editorSidebar(page),
      "Always require a value",
    );
    await expect(alwaysRequire).toHaveCount(2);
    await alwaysRequire.nth(0).scrollIntoViewIfNeeded();
    await alwaysRequire.nth(0).click();

    await expect(alwaysRequire).toHaveCount(2);
    await alwaysRequire.nth(1).scrollIntoViewIfNeeded();
    await alwaysRequire.nth(1).click();

    await expect(saveButton).toBeDisabled();

    // Configure the first template tag default
    const defaultInputs = editorSidebar(page).getByPlaceholder(
      "Enter a default value…",
    );
    await expect(defaultInputs).toHaveCount(2);
    await typeAppend(defaultInputs.nth(0), "Default Name");

    await expect(saveButton).toBeDisabled();

    // Configure the second template tag
    const variableTypes = editorSidebar(page).getByLabel("Variable type");
    await expect(variableTypes).toHaveCount(2);
    await variableTypes.nth(1).click();
    await directText(popover(page), "Number").click();
    await expect(defaultInputs).toHaveCount(2);
    await typeAppend(defaultInputs.nth(1), "42");

    // Save the transform with all template tags configured
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await typeAppend(
      saveModal.getByPlaceholder("My Great Transform"),
      TRANSFORM_NAME,
    );
    await saveModal.getByRole("button", { name: "Save", exact: true }).click();
    await assertIsTransformRunnable(page);
  });
});

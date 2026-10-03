/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/transforms/reproductions.cy.spec.ts
 * (277 lines, 6 `issue NNNNN` describes with exactly one `it` each).
 *
 * Every upstream `it` has a counterpart here, in upstream order. The describes
 * are ported 1:1 and deliberately NOT merged — each is an independent
 * reproduction with its own fixture requirements (three of the six need a
 * different warehouse fixture from the others), and merging them would couple
 * unrelated regressions. There are no upstream `@skip`s in this file.
 *
 * The full token derivation, the QA-DB tier note, and the two target-table
 * renames (both forced by MEASURED collisions in the shared, never-reset
 * writable container) live in support/transforms-reproductions.ts. Short
 * version: `check-feature-enabled!` routes native/MBQL transforms to
 * `query-transforms-enabled?`, which short-circuits on `is-hosted? = false`;
 * this file contains no python transform at all, so the token is inert here.
 * A gate-OFF control (activateToken removed, whole file re-run) confirmed it.
 *
 * ---------------------------------------------------------------------------
 * Assertion-shape notes, per upstream construct
 * ---------------------------------------------------------------------------
 * - `directText()` below reproduces testing-library's `getNodeText`, which
 *   reads only DIRECT CHILD text nodes. Playwright's `getByText` reads the full
 *   `textContent`, so `<div>-- MARKER</div>` wrapping `<span>-- MARKER</span>`
 *   matches TWICE under Playwright and once upstream. It is used in the two
 *   places where the markup is genuinely nested — the CodeMirror line marker
 *   (UXW-3160) and the Mantine `SelectItem` option (#68378) — and, per the
 *   same rule, on the `not.exist` check for "Something's gone wrong"
 *   (GDGT-1776), where a BROADER matcher would drift an absence assertion the
 *   wrong way. Everywhere else the target is a leaf menu item and
 *   `getByText(x, { exact: true })` agrees with upstream, which is also the
 *   convention the sibling transforms-* ports already use.
 * - `should("not.exist")` -> `toHaveCount(0)` (both retry).
 * - `should("have.length.greaterThan", 0)` -> `not.toHaveCount(0)`, which
 *   retries; `expect(await loc.count()).toBeGreaterThan(0)` would not.
 * - `cy.go("back")` -> `page.goBack()`.
 * - `cy.realPress("Escape")` -> `page.keyboard.press("Escape")`. Nothing here
 *   needs cypress-real-events' CDP dispatch: the key is consumed by Mantine's
 *   own React `onKeyDown`, not by a native browser affordance.
 * - `H.NativeEditor.type(sql, { allowFastSet: true })` does NOT type — upstream
 *   writes `.cm-content`'s textContent directly and then types " {backspace}"
 *   to make CodeMirror re-run its validator. Ported via the existing
 *   `fastSetNativeEditor`, which reproduces that verbatim. No keystrokes means
 *   no autocomplete `interactionDelay` hazard on the `SELECT 42` payloads.
 *
 * ---------------------------------------------------------------------------
 * Two upstream weaknesses, ported verbatim and RECORDED rather than fixed
 * ---------------------------------------------------------------------------
 * 1. #68378 ends on `H.modal().button("Save").click()` with NO assertion after
 *    it. The real reproduction assertion is the one before it — that
 *    `empty_schema` is offered in the target-schema picker at all, which is the
 *    bug (empty schemas have no synced tables, so they can only reach the
 *    picker via `GET /api/database/:id/syncable_schemas`). A failing Save would
 *    go unnoticed by this test in either harness. Not strengthened.
 * 2. GDGT-1776 asserts `loading-indicator` does not exist BEFORE it asserts the
 *    Cancel button is visible. That ordering makes the first assertion
 *    satisfiable pre-fetch, i.e. potentially vacuous on its own; the
 *    `Cancel` visibility check that follows is the real anchor and it is a
 *    positive one, so the test as a whole is not vacuous. Order preserved.
 */
import type { Locator, Page } from "@playwright/test";

import { TableSection, visitDataModel } from "../support/data-model";
import { expect, test } from "../support/fixtures";
import { leaveConfirmationModal } from "../support/documents-core";
import {
  blurNativeEditor,
  fastSetNativeEditor,
} from "../support/native-reproductions";
import {
  WRITABLE_DB_ID,
  getTableId,
  resyncDatabase,
} from "../support/schema-viewer";
import { getFieldId } from "../support/table-editing";
import { createTransform, createSqlTransform } from "../support/transforms";
import { resetManySchemasTable } from "../support/transforms-codegen";
import { createAndRunSqlTransform } from "../support/transforms-inspect";
import {
  DB_NAME,
  DELETED_TRANSFORM_TARGET_TABLE,
  QA_DB_SKIP_REASON,
  SOURCE_TABLE,
  TARGET_SCHEMA,
  TARGET_TABLE,
  createMockSearchResult,
  getQueryEditor,
  resetEmptySchema,
  resetReproTargetTables,
  visitTransformListPage,
  visitTransformSettingsTab,
} from "../support/transforms-reproductions";
import { main, modal, popover } from "../support/ui";

/**
 * Stands in for upstream's `H.popover().findByText("Writable Postgres12").click()`
 * (spec lines 23 and 226).
 *
 * That click CANNOT be ported literally on this instance, and the reason was
 * MEASURED here rather than inherited from the sibling transforms-incremental
 * port that reports the same symptom. Probe (tests/s1-transforms-repro-probe,
 * since deleted), sampling immediately after the "SQL query" click:
 *
 *   PROBE databases: [{"id":1,"name":"Sample Database","engine":"h2"},
 *                     {"id":2,"name":"Writable Postgres12","engine":"postgres"}]
 *   PROBE t~0:    popovers=1 dbRows=1 topBar="Select a database"
 *   PROBE t~200:  popovers=0 dbRows=0 topBar="Writable Postgres12"
 *   PROBE t~500+: popovers=0 dbRows=0 topBar="Writable Postgres12"
 *
 * Exactly one database is transform-eligible (the H2 Sample Database is not),
 * so the app AUTO-SELECTS it: the database popover exists at t=0 and is gone by
 * t+200ms with no click from the test. Playwright's actionability checks lose
 * that race every time — the literal port spent the full 30s in
 * "element was detached from the DOM, retrying", with the call log showing the
 * row resolving and then detaching on each retry. Cypress's command queue paces
 * past the settle.
 *
 * Note this is the AUTO-SELECT mechanism, not the "two popovers transiently
 * visible" one the sibling's comment describes first — the probe shows exactly
 * one popover at t=0, never two.
 *
 * Ported as the STATE the click exists to establish, which is also all the rest
 * of each test depends on: the editor is bound to DB_NAME. Not a weakening — if
 * a second eligible database ever appears and the popover stops auto-resolving,
 * this fails loudly instead of proceeding on the wrong database.
 *
 * NOT CROSS-CHECKED against Cypress (standing rule: no Cypress run here), so I
 * cannot say whether upstream races this too, or whether CI has a second
 * eligible database that keeps the popover open. Recorded as an
 * environment-dependent divergence.
 */
async function expectDatabaseAutoSelected(page: Page) {
  await expect(
    page.getByTestId("native-query-top-bar").getByText(DB_NAME, { exact: true }),
  ).toBeVisible();
}

/**
 * The leave-confirm modal's CONTENT box, for the one `should("be.visible")`
 * upstream makes against it (spec line 243).
 *
 * `H.leaveConfirmationModal()` is `cy.findByTestId("leave-confirmation")`, and
 * that testid sits on Mantine's Modal **root** — a positioning wrapper whose
 * own border box is ZERO-HEIGHT, because the dialog inside it is
 * position:fixed. Measured on the open modal:
 *
 *   className:    "... mb-mantine-Modal-root"
 *   rect:         { w: 1280, h: 0 }      <- the element the testid is on
 *   display:      "block"   visibility: "visible"   opacity: "1"
 *   textSnippet:  "Discard your changes?Your changes haven't been saved, ..."
 *   contentClass: "... mb-mantine-Modal-content ..."
 *   contentRect:  { w: 620, h: 190 }     <- what the user actually sees
 *
 * Playwright's `toBeVisible()` requires a non-empty bounding box ON THE
 * ELEMENT ITSELF, so it calls that root hidden. Cypress's `should("be.visible")`
 * does not — a zero-box parent with a rendered, sized descendant passes there.
 * This is a harness-semantics difference on `be.visible`, NOT port drift and
 * NOT an app failure: the dialog is genuinely on screen, `"Discard your
 * changes?"` is rendered, and the content box is 620x190.
 *
 * So visibility is asserted on the content — the `[role=dialog][aria-modal]`
 * node, i.e. the same selector the shared `modal()` helper uses — which is the
 * thing Cypress's assertion is effectively about. The `should("not.exist")`
 * assertions later in the test stay on the ROOT (existence, not visibility, so
 * the zero box is irrelevant there), exactly as upstream writes them.
 */
function leaveConfirmationContent(page: Page): Locator {
  return leaveConfirmationModal(page).locator(
    "[role='dialog'][aria-modal='true']",
  );
}

/**
 * Reproduction of testing-library's `getNodeText` matcher: an element matches
 * when one of its DIRECT CHILD text nodes normalizes to `text`. See the header.
 */
function directText(scope: Locator, text: string): Locator {
  const literal = text.includes("'") ? `concat('${text.split("'").join("', \"'\", '")}')` : `'${text}'`;
  return scope.locator(`xpath=.//*[text()[normalize-space(.)=${literal}]]`);
}

test.describe("issue #68378", () => {
  // DESCRIBE-level skip, not a beforeEach one: this describe has no afterEach
  // today, but the beforeEach form reports skipped tests as FAILED whenever one
  // is added, so all six describes use the same safe form.
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    await resetEmptySchema();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
  });

  test("should show empty schemas when picking a target schema (metabase#68378)", async ({
    page,
  }) => {
    await visitTransformListPage(page);
    await page
      .getByRole("button", { name: "Create a transform", exact: true })
      .click();
    await popover(page).getByText("SQL query", { exact: true }).click();
    await expectDatabaseAutoSelected(page);
    await fastSetNativeEditor(page, "SELECT 42");
    await blurNativeEditor(page);

    // cy.log("Save with empty_schema as target schema")
    await getQueryEditor(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();

    const saveModal = modal(page);
    await saveModal.getByLabel("Name", { exact: true }).clear();
    await saveModal.getByLabel("Name", { exact: true }).fill("SQL transform");
    await saveModal.getByLabel("Schema", { exact: true }).click();

    // The reproduction assertion: `empty_schema` contains no tables, so it is
    // absent from synced metadata and can only reach this picker through
    // `GET /api/database/:id/syncable_schemas`, which queries the warehouse.
    const emptySchemaOption = directText(popover(page), "empty_schema");
    await expect(emptySchemaOption).toBeVisible();
    await emptySchemaOption.click();

    // Upstream ends here, with no assertion on the outcome. See the header.
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
  });
});

test.describe("issue GDGT-1776", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore("postgres-writable");
    await resetEmptySchema();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);

    const ITEMS_COUNT = 1000;

    // cy.intercept("GET", "/api/collection/root/items*", { statusCode: 200, body })
    // Cypress's glob `*` does not cross `/`, so the route matches the exact
    // pathname and lets the query string vary — same set of requests.
    await page.route(
      (url) => url.pathname === "/api/collection/root/items",
      (route) =>
        route.fulfill({
          status: 200,
          json: {
            data: Array.from({ length: ITEMS_COUNT }).map((_value, index) =>
              createMockSearchResult({ id: index + 1, model: "table" }),
            ),
            limit: null,
            models: [
              "card",
              "collection",
              "dashboard",
              "dataset",
              "document",
              "metric",
              "pulse",
              "table",
              "timeline",
            ],
            offset: null,
            total: ITEMS_COUNT,
          },
        }),
    );
  });

  test("should not crash the app when processing lots of hidden items in the MiniPicker (GDGT-1776)", async ({
    page,
  }) => {
    await visitTransformListPage(page);
    await page
      .getByRole("button", { name: "Create a transform", exact: true })
      .click();
    await popover(page).getByText("Query builder", { exact: true }).click();
    await popover(page).getByText("Our analytics", { exact: true }).click();

    await expect(page.getByTestId("loading-indicator")).toHaveCount(0);
    // Curly apostrophe (U+2019), verbatim from upstream — the ASCII form does
    // not appear in the FE bundle.
    await expect(directText(main(page), "Something’s gone wrong")).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue GDGT-1774", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    await resetManySchemasTable();
    // No counterpart upstream — the physical already-exists guard on
    // POST /api/transform cannot be cleared by the app-DB restore, and this
    // container is long-lived and shared. See the support module's header.
    await resetReproTargetTables();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
    // `tables` (not the bare form): resetManySchemasTable just recreated
    // Animals, and a stale `initial_sync_status: "complete"` row would satisfy
    // the bare wait instantly.
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [SOURCE_TABLE],
    });
  });

  test("should display field options in the incremental update field picker (GDGT-1774)", async ({
    page,
    mb,
  }) => {
    const tableId = await getTableId(mb.api, { name: SOURCE_TABLE });
    const fieldId = await getFieldId(mb.api, { tableId, name: "score" });
    const { id } = await createTransform(mb.api, {
      name: "Incremental MBQL transform",
      source: {
        type: "query",
        query: {
          database: WRITABLE_DB_ID,
          type: "query",
          query: { "source-table": tableId },
        },
        "source-incremental-strategy": {
          type: "checkpoint",
          "checkpoint-filter-field-id": fieldId,
        },
      },
      target: {
        type: "table-incremental",
        database: WRITABLE_DB_ID,
        name: TARGET_TABLE,
        schema: TARGET_SCHEMA,
        "target-incremental-strategy": { type: "append" },
      },
    });
    await visitTransformSettingsTab(page, id);

    // cy.log("Field picker should be visible and have selectable options")
    const fieldPicker = page.getByLabel("Field to check for new values", {
      exact: true,
    });
    await fieldPicker.scrollIntoViewIfNeeded();
    await expect(fieldPicker).toBeVisible();
    await fieldPicker.click();

    await expect(popover(page).getByRole("option")).not.toHaveCount(0);
  });
});

test.describe("issue UXW-3160", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
  });

  test("should let the read-only definition view scroll to the last line of a long SQL transform (UXW-3160)", async ({
    page,
    mb,
  }) => {
    const lastLineMarker = "-- UXW_3160_LAST_LINE";
    const longSql =
      "SELECT\n  " +
      Array.from({ length: 80 }, (_, i) => `'col_${i}' AS col_${i}`).join(
        ",\n  ",
      ) +
      `\n${lastLineMarker}`;

    // H.createSqlTransform({ ..., visitTransform: true }) — the helper's
    // `visitTransform` flag is `cy.visit("/data-studio/transforms/:id")`
    // (e2e-transform-helpers.ts:34), done explicitly here.
    const { id } = await createSqlTransform(mb.api, {
      name: "Long SQL transform",
      sourceQuery: longSql,
      targetTable: "uxw_3160_target",
      targetSchema: "public",
    });
    await page.goto(`/data-studio/transforms/${id}`);

    const scroller = page.locator(".cm-scroller");
    // Not upstream: `cy.get` is any-of while a Playwright Locator is strict, so
    // the one-scroller precondition is asserted rather than silently assumed
    // via `.first()`. Stated as a strengthening.
    await expect(scroller).toHaveCount(1);

    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    // `expect(rect.bottom).to.be.at.most(Cypress.config("viewportHeight"))`.
    // Read from the LIVE viewport, which is what Cypress's config value also
    // is; this harness runs 1280x720 rather than the 800 the config names, so
    // hardcoding 800 would test a viewport that does not exist here.
    const viewportHeight = page.viewportSize()?.height;
    expect(viewportHeight).toBeDefined();
    await expect
      .poll(() =>
        scroller.evaluate((element) => element.getBoundingClientRect().bottom),
      )
      .toBeLessThanOrEqual(viewportHeight as number);

    await expect(directText(scroller, lastLineMarker)).toBeVisible();
  });
});

test.describe("issue 69904", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    // No counterpart upstream — this is the one test in the file that RUNS its
    // transform, so it writes a physical table the app-DB restore cannot clear.
    await resetReproTargetTables();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
  });

  test.afterEach(async () => {
    if (process.env.PW_QA_DB_ENABLED) {
      await resetReproTargetTables();
    }
  });

  test("should not crash the app when opening table created by a deleted transform (metabase#69904)", async ({
    page,
    mb,
  }) => {
    const { transformId } = await createAndRunSqlTransform(mb.api, {
      name: "Transform to delete",
      sourceQuery: "SELECT 1 AS answer",
      targetTable: DELETED_TRANSFORM_TARGET_TABLE,
      targetSchema: "public",
    });

    // cy.request("DELETE", `/api/transform/${transformId}`)
    await mb.api.fetch("DELETE", `/api/transform/${transformId}`);

    const tableId = await getTableId(mb.api, {
      databaseId: WRITABLE_DB_ID,
      name: DELETED_TRANSFORM_TARGET_TABLE,
    });
    await visitDataModel(page, "data studio", {
      databaseId: WRITABLE_DB_ID,
      schemaId: `${WRITABLE_DB_ID}:public`,
      tableId,
    });

    await expect(
      TableSection.get(page).getByText("Transform does not exist anymore", {
        exact: true,
      }),
    ).toBeVisible();
  });
});

test.describe("issue GDGT-2429", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
  });

  async function startNewSqlTransform(page: Page) {
    await visitTransformListPage(page);
    await page
      .getByRole("button", { name: "Create a transform", exact: true })
      .click();
    await popover(page).getByText("SQL query", { exact: true }).click();
    await expectDatabaseAutoSelected(page);
    await fastSetNativeEditor(page, "SELECT 42");
    await blurNativeEditor(page);
  }

  async function openSaveModal(page: Page) {
    await getQueryEditor(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(
      modal(page).getByText("Save your transform", { exact: true }),
    ).toBeVisible();
  }

  test("should warn about unsaved changes when navigating away while the save modal is open (metabase#GDGT-2429)", async ({
    page,
  }) => {
    await startNewSqlTransform(page);
    await openSaveModal(page);

    // cy.log("navigating away while the save modal is open should warn")
    // `cy.go("back")` is `window.history.back()` on the AUT window, which is
    // what react-router v3's `setRouteLeaveHook` observes. `page.goBack()` is a
    // CDP history navigation, so the JS form is the faithful one.
    //
    // The URL DOES change to /data-studio/transforms here, and that is the
    // app's design rather than a failure to block: `useConfirmRouteLeaveModal`
    // (frontend/src/metabase/common/hooks/use-confirm-route-leave-modal.ts)
    // shows the modal and, on confirm, dispatches `goBack()` for a POP.
    // Measured, after an earlier note in this port wrongly read the URL change
    // as "the blocker never fired".
    await page.evaluate(() => window.history.back());
    await expect(leaveConfirmationContent(page)).toBeVisible();

    // cy.log("pressing Esc should close the warning, not the saving modal")
    // Upstream's comment, reproduced because the wait is load-bearing: wait for
    // Mantine's focus trap to move focus inside the leave-confirm modal before
    // pressing Escape. `be.visible` passes during the open transition, before
    // the trap engages, so an early Escape lands outside the modal's
    // focus-trapped content (where its closeOnEscape handler lives) and is
    // lost, leaving the modal open.
    await expect(leaveConfirmationModal(page).locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(leaveConfirmationModal(page)).toHaveCount(0);
    await expect(
      modal(page).getByText("Save your transform", { exact: true }),
    ).toBeVisible();

    // cy.log("saving the transform should allow navigating away without warning")
    // cy.intercept("POST", "/api/transform").as("createTransform") is
    // registered upstream in the test body before anything happens; here the
    // wait is registered immediately before the action that triggers it and
    // awaited after (PORTING rule 2) — `cy.wait("@alias")` pops PAST
    // responses, but no /api/transform POST fires earlier in this test, so the
    // two are equivalent.
    const saveModal = modal(page);
    await saveModal.getByLabel("Name", { exact: true }).clear();
    await saveModal
      .getByLabel("Name", { exact: true })
      .fill("GDGT-2429 transform");
    const createTransform = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/transform",
    );
    await saveModal.getByRole("button", { name: "Save", exact: true }).click();
    await createTransform;

    await page.evaluate(() => window.history.back());
    await expect(leaveConfirmationModal(page)).toHaveCount(0);
  });
});

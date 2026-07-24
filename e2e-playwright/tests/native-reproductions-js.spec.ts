/**
 * Playwright port of e2e/test/scenarios/native/native-reproductions.cy.spec.**js**
 *
 * 🔴 SOURCE FILE — READ THIS BEFORE RENAMING ANYTHING. The upstream `native/`
 * directory holds BOTH `native-reproductions.cy.spec.ts` AND
 * `native-reproductions.cy.spec.js`, and they are **completely disjoint**
 * specs. This file ports the **.js** one (issues 12439, 16886, 16914, 17060,
 * 18148, 19451, 20044, 20625, 21034, 21550, 31926, 21597, 23510, 30680, 34330,
 * 35344, 35785, 22991, 46308). The `.ts` sibling was ported earlier to
 * `tests/native-reproductions.spec.ts` with `support/native-reproductions.ts`
 * and is NOT touched here. Target + support module both carry the `-js` suffix
 * so the pair cannot collide.
 *
 * A reproductions file is many independent regression guards — the describes
 * are kept 1:1 with upstream, in upstream order, and nothing is merged.
 *
 * ## Infra tier (measured, not inferred from tags — the tags mislead twice)
 * - **19 of 20 tests need only the H2 sample DB.** They run on the bare jar.
 * - `issue 31926` (`@external`) is the ONLY container-dependent describe: it
 *   calls `H.addPostgresDatabase`, which connects to the QA Postgres on
 *   :5404 (the `postgres-sample` container). Gated on `PW_QA_DB_ENABLED`.
 * - `issue 21597` carries `{ tags: "@external" }` and needs **nothing**. Its
 *   own header comment explains why: PR#54453 removed the change-the-database
 *   mechanic, and the test now types `SELECT 1` and mocks `POST /api/card`
 *   with a 400. There is no second database, no QA container, no writable DB.
 *   **The tag is stale** — gating on it would have skipped a runnable test, so
 *   it is deliberately NOT gated here.
 * - `issue 18148` adds a **SQLite** database, which is a repo-root fixture
 *   file served by the built-in driver (`resources/sqlite-fixture.db`, and slot
 *   backends run from REPO_ROOT) — no container, so no gate.
 * - Nothing in this file touches the writable DB, so #85's schema-debris
 *   hazards do not apply.
 *
 * ## Upstream skips ported as skips
 * - `issue 20625` is tagged `{ tags: "@skip" }` upstream, i.e. excluded from
 *   every CI run. Both its tests are ported in full and skipped with that
 *   reason, so the port stays a complete transcription.
 *
 * ## Porting notes specific to this file
 * - `cy.realPress("Home"|"End")` and `cy.realPress(["Shift","ArrowRight"])`
 *   are CDP key dispatches; `page.keyboard.press("Home"|"Shift+ArrowRight")`
 *   is the same path. Repeated presses are separate `press` calls — NOT
 *   `press(k, { delay })`, which is the keydown→keyup HOLD (PORTING,
 *   corrected 2026-07-20).
 * - `cy.type()` CLICKS its subject first and then sends keystrokes to
 *   `document.activeElement`. Native parameter widgets drop their
 *   `placeholder` on focus, so a placeholder-based locator is resolved ONCE,
 *   clicked, and then typed into via `page.keyboard` — never re-resolved.
 * - `.click({ force: true })` in Cypress is a DISPATCH; ported as
 *   `dispatchEvent("click")`, not Playwright's `click({ force: true })`.
 * - `cy.contains(str)` is a case-sensitive substring first-match →
 *   `caseSensitiveSubstring`. `cy.findByText(str)` is exact → `{ exact: true }`.
 * - Absence assertions are anchored on a signal that renders in BOTH the fixed
 *   and buggy variants before the check runs; each anchor is commented.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import { addPostgresDatabase } from "../support/embedding-hub";
import { openVizSettingsSidebar, leftSidebar } from "../support/charts";
import { visitNativeQuestionAdhoc } from "../support/charts-extras";
import { USER_GROUPS, updateCollectionGraph } from "../support/click-behavior";
import { createCollection } from "../support/dashboard-core";
import { createQuestion } from "../support/factories";
import { cartesianChartCircles } from "../support/metrics";
import { runNativeQuery } from "../support/models";
import {
  focusNativeEditor,
  nativeEditor,
  nativeEditorCompletion,
  startNewNativeQuestion,
  typeInNativeEditor,
} from "../support/native-editor";
import { createNativeCard } from "../support/native-extras";
import { getRunQueryButton, runQuery } from "../support/native-filters";
import {
  startNewNativeModel,
  triggerMouseEvent,
} from "../support/native-reproductions";
import {
  clearBrowserCache,
  isAutocompleteRequest,
  recordRequests,
} from "../support/native-reproductions-js";
import { queryBuilderMain } from "../support/notebook";
import { addSqliteDatabase } from "../support/homepage";
import { mainAside } from "../support/question-reproductions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { caseSensitiveSubstring } from "../support/text";
import {
  appBar,
  icon,
  main,
  modal,
  popover,
  visitQuestion,
} from "../support/ui";

const { PRODUCTS, ORDERS_ID } = SAMPLE_DATABASE;

const QA_DB_SKIP_REASON =
  "Requires the QA Postgres container on :5404 (set PW_QA_DB_ENABLED)";

/**
 * Register a wait for the next query response from EITHER endpoint: a saved
 * native question runs through POST /api/card/:id/query and an ad-hoc or dirty
 * one through POST /api/dataset (PORTING). Upstream's `getRunQueryButton().click()`
 * has no wait at all; a bare `/api/dataset` wait deadlocks after a save.
 */
function waitForQueryEitherEndpoint(page: Page) {
  return page.waitForResponse((response) => {
    const { pathname } = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      (pathname === "/api/dataset" ||
        /^\/api\/card\/\d+\/query$/.test(pathname))
    );
  });
}

/** `cy.realPress(key)` repeated n times. Separate presses, no `delay` option. */
async function pressRepeatedly(page: Page, key: string, times: number) {
  for (let index = 0; index < times; index++) {
    await page.keyboard.press(key);
  }
}

test.describe("issue 12439", () => {
  const nativeQuery = `
  SELECT "PRODUCTS__via__PRODUCT_ID"."CATEGORY" AS "CATEGORY",
         date_trunc('month', "ORDERS"."CREATED_AT") AS "CREATED_AT",
         count(*) AS "count"
  FROM "ORDERS"
  LEFT JOIN "PRODUCTS" "PRODUCTS__via__PRODUCT_ID"
         ON "ORDERS"."PRODUCT_ID" = "PRODUCTS__via__PRODUCT_ID"."ID"
  GROUP BY "PRODUCTS__via__PRODUCT_ID"."CATEGORY",
           date_trunc('month', "ORDERS"."CREATED_AT")
  ORDER BY "PRODUCTS__via__PRODUCT_ID"."CATEGORY" ASC,
           date_trunc('month', "ORDERS"."CREATED_AT") ASC
  `;

  const questionDetails = {
    dataset_query: {
      database: SAMPLE_DB_ID,
      native: {
        query: nativeQuery,
      },
      type: "native",
    },
    display: "line",
  } as const;

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // H.visitQuestionAdhoc with a native query autoruns it (runQueryIfNeeded).
    await visitNativeQuestionAdhoc(page, questionDetails);
  });

  test("should allow clicking on a legend in a native question without breaking the UI (metabase#12439)", async ({
    page,
  }) => {
    const visualizationRoot = page.getByTestId("query-visualization-root");

    await visualizationRoot.getByText("Gizmo", { exact: true }).click();

    // Make sure the legends and the graph are still there
    await expect(
      visualizationRoot.getByText("Gizmo", { exact: true }),
    ).toBeVisible();
    await expect(
      visualizationRoot.getByText("Doohickey", { exact: true }),
    ).toBeVisible();

    // H.cartesianChartCircle() is `cartesianChartCircles().should("be.visible")`
    // on a MULTI-element subject — an ANY-of-set assertion (PORTING rule 3),
    // so `.filter({ visible: true }).first()` is the faithful port.
    await expect(
      cartesianChartCircles(page).filter({ visible: true }).first(),
    ).toBeVisible();

    // Make sure buttons are clickable
    await openVizSettingsSidebar(page);

    // H.sidebar() is `cy.get("main aside")`; `.contains(x)` is a
    // case-sensitive substring first-match with an implicit existence check.
    await expect(
      mainAside(page).getByText(caseSensitiveSubstring("X-axis")).first(),
    ).toBeAttached();
    await expect(
      mainAside(page).getByText(caseSensitiveSubstring("Y-axis")).first(),
    ).toBeAttached();
  });
});

test.describe("issue 16886", () => {
  const ORIGINAL_QUERY = "select 1 from orders";
  const SELECTED_TEXT = "select 1";

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("shouldn't remove parts of the query when choosing 'Run selected text' (metabase#16886)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, ORIGINAL_QUERY);
    await page.keyboard.press("Home");
    await pressRepeatedly(page, "Shift+ArrowRight", SELECTED_TEXT.length);

    await icon(
      page.getByTestId("native-query-editor-container"),
      "play",
    ).click();

    // `.invoke("text").should("eq", "1")` — an exact text match.
    await expect(page.getByTestId("scalar-value")).toHaveText("1");

    await expect(nativeEditor(page)).toContainText(ORIGINAL_QUERY);
  });
});

test.describe("issue 16914", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should recover visualization settings after a failed query (metabase#16914)", async ({
    page,
  }) => {
    const FAILING_PIECE = " foo";

    await visitNativeQuestionAdhoc(page, {
      display: "table",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "native",
        native: {
          query: "SELECT 'a' as hidden, 'b' as visible",
        },
      },
      visualization_settings: {},
    });

    await openVizSettingsSidebar(page);
    // `.icon("eye_outline").click({ force: true })` — Cypress force-clicks are
    // DISPATCHES; Playwright's `click({ force: true })` would move the real
    // mouse and hit whatever is topmost (PORTING).
    await icon(
      leftSidebar(page).getByTestId("draggable-item-HIDDEN"),
      "eye_outline",
    ).dispatchEvent("click");
    // cy.button("Done") → findByRole("button", { name }) → exact.
    await page.getByRole("button", { name: "Done", exact: true }).click();

    await typeInNativeEditor(page, FAILING_PIECE);
    await runNativeQuery(page);

    await focusNativeEditor(page);
    await page.keyboard.press("End");
    await pressRepeatedly(page, "Shift+ArrowLeft", FAILING_PIECE.length);
    await page.keyboard.press("Backspace");
    await runNativeQuery(page);

    const visualizationRoot = page.getByTestId("query-visualization-root");
    // ANCHOR: upstream asserts absence FIRST, but `runNativeQuery` resolves on
    // the dataset response — the table has not necessarily painted yet, so a
    // bare absence check there is satisfied by "nothing has rendered". "VISIBLE"
    // is the column upstream asserts one line later and only exists in the
    // settled, correct render, so it is asserted first as the anchor.
    await expect(
      visualizationRoot.getByText("VISIBLE", { exact: true }),
    ).toBeVisible();
    await expect(
      visualizationRoot.getByText("Every field is hidden right now", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      visualizationRoot.getByText("HIDDEN", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 17060", () => {
  const ORIGINAL_QUERY =
    'select ID as "num", CATEGORY as "text" from PRODUCTS limit 1';
  const SECTION = "select ";
  const SELECTED_TEXT = "ID";

  /**
   * Port of the spec-local rearrangeColumns. Cypress `.trigger(name, x, y)` is
   * a synthetic MouseEvent dispatch at an element-relative point, NOT a real
   * mouse drag.
   */
  async function rearrangeColumns(page: Page) {
    const firstDraggable = leftSidebar(page)
      .getByTestId(/draggable-item/)
      .first();
    await triggerMouseEvent(firstDraggable, "mousedown", { x: 0, y: 0 });
    await triggerMouseEvent(firstDraggable, "mousemove", { x: 5, y: 5 });
    await triggerMouseEvent(firstDraggable, "mousemove", { x: 0, y: 100 });
    await triggerMouseEvent(firstDraggable, "mouseup", { x: 0, y: 100 });
  }

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await visitNativeQuestionAdhoc(page, {
      display: "table",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "native",
        native: {
          query: ORIGINAL_QUERY,
        },
      },
      visualization_settings: {},
    });

    await openVizSettingsSidebar(page);
    await expect(leftSidebar(page)).toBeVisible();
    await rearrangeColumns(page);
  });

  test("should not render duplicated columns (metabase#17060)", async ({
    page,
  }) => {
    await focusNativeEditor(page);
    await page.keyboard.press("Home");
    await pressRepeatedly(page, "ArrowRight", SECTION.length);
    await pressRepeatedly(page, "Shift+ArrowRight", SELECTED_TEXT.length);
    // `H.NativeEditor.type("RATING", { focus: false })` — no editor click, the
    // selection made above must survive.
    await typeInNativeEditor(page, "RATING", { focus: false });
    await runQuery(page);

    await expect(
      page.getByTestId("query-visualization-root").getByText("num", {
        exact: true,
      }),
    ).toBeVisible();
  });
});

test.describe("issue 18148", () => {
  const dbName = "sqlite";

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // SQLite is a built-in driver reading a repo-root fixture file — this is
    // NOT a container dependency, so the describe stays ungated.
    //
    // The sync-waiting variant of the helper is deliberate. `cy.addSQLiteDatabase`
    // is a bare POST, but the native-editor database picker drops a database
    // whose `initial_sync_status` is still "incomplete": measured, the row
    // renders, then a refetch removes it and the click fails with "element was
    // detached from the DOM" on a list that no longer contains "sqlite" at all.
    // Cypress never saw this because its command pacing put ~seconds between
    // the POST and the picker opening. This is the PORTING "list re-renders
    // under a resolved locator" rule — anchor on the state that settles it.
    await addSqliteDatabase(mb.api, dbName);
  });

  /**
   * 🔴 PRODUCT REGRESSION — the database picker auto-picks the FIRST database
   * instead of waiting for a choice, so this test's flow cannot complete.
   *
   * Measured on the jar (751c2a9 == target/uberjar/COMMIT-ID 751c2a98), fresh
   * restore, `last-used-native-database-id` verified `null` beforehand:
   *   +674ms  picker open, `gui-builder-data` = "Select a database",
   *           popover lists BOTH "Sample Database" and "sqlite"
   *   +752ms  FE issues `PUT /api/setting/last-used-native-database-id`
   *   +816ms  `gui-builder-data` = "Sample Database", popover count 0 —
   *           and it never reopens
   * The click on "sqlite" resolves the row and then loses it
   * ("element was detached from the DOM, retrying") until the 30s timeout.
   *
   * Cause, read from source: `DataSelector.skipSteps()`
   * (frontend/src/metabase/querying/common/components/DataSelector/DataSelector.tsx:707)
   * runs on the DATABASE step when `useOnlyAvailableDatabase` (a defaultProp,
   * `true`, line 289) and no database is selected. PR #64406 (2a6741df9cf,
   * 2025-12-18, "Do not pick unsupported databases automatically in
   * transforms") changed its guard from
   *     if (databases && databases.length === 1)   // auto-select the ONLY one
   * to
   *     if (enabledDatabases.length >= 1)          // auto-select the FIRST
   * while the comment above it still reads "for steps where there's a single
   * option". The `>= 1` looks unintended: the PR's subject was filtering
   * disabled databases, not widening when auto-selection fires.
   *
   * Why the measurement pins the cause rather than merely fitting it: the
   * instance had TWO enabled databases when the auto-select fired. Under the
   * old `=== 1` guard that is impossible; only `>= 1` can produce it. And the
   * `PUT last-used-native-database-id` is reachable only via
   * `onChangeDatabase` → View.tsx:350 `rememberLastUsedDatabase`, i.e. the app
   * really did perform a *selection*, not just a render.
   *
   * Ruled out as port drift: parking the real cursor far from the popover
   * before it mounts changes nothing (both arms auto-select), so it is not the
   * PORTING "parked cursor" family; and the port's only deviation from
   * upstream here — `addSqliteDatabase` waiting for `initial_sync_status`,
   * where `cy.addSQLiteDatabase` is a bare POST — runs entirely before
   * `page.goto` and can only make the database list MORE complete.
   *
   * NOT VERIFIED: whether the Cypress original also fails on this artifact (a
   * cross-check was out of scope for this port). The ~80ms window between the
   * picker painting and the auto-select is short but non-zero, so upstream is
   * plausibly flaky rather than reliably red — I could not measure that, and
   * am not claiming it. What is measured is that the window is far too short
   * for this port to use, and that nothing reopens the picker afterwards.
   *
   * Left as a faithful transcription of upstream rather than reworked to dodge
   * the auto-select: winning that race would assert nothing about #18148 and
   * would hide the regression.
   */
  test.fixme(
    true,
    "DataSelector.skipSteps auto-selects the first database (PR #64406 changed `=== 1` to `>= 1`), closing the picker before 'sqlite' can be chosen — see the block comment above",
  );
  test("should not offer to save the question before it is actually possible to save it (metabase#18148)", async ({
    page,
  }) => {
    await page.goto("/");
    await appBar(page).getByLabel("New", { exact: true }).click();
    await popover(page).getByText("SQL query", { exact: true }).click();

    await expect(page.getByTestId("qb-save-button")).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await expect(page.getByTestId("gui-builder-data")).toContainText(
      "Select a database",
    );
    // `should("contain", x)` on the popover SET is chai-jquery's ANY-OF case
    // (PORTING) — with one popover open this is the same element either way.
    await expect(popover(page)).toContainText("Sample Database");
    await expect(popover(page)).toContainText(dbName);
    await popover(page).getByText(dbName, { exact: true }).click();

    await typeInNativeEditor(page, "select foo");

    await page.getByTestId("qb-save-button").click();
    // `should("exist")` — existence, not visibility.
    await expect(
      page.getByTestId("save-question-modal").getByText("Save", { exact: true }),
    ).toBeAttached();
  });
});

test.describe("issue 19451", () => {
  const question = {
    name: "19451",
    native: {
      query: "select count(*) from products where {{filter}}",
      "template-tags": {
        filter: {
          id: "1b33304a-18ea-cc77-083a-b5225954f200",
          name: "filter",
          "display-name": "Filter",
          type: "dimension",
          dimension: ["field", PRODUCTS.ID, null],
          "widget-type": "id",
          default: null,
        },
      },
    },
    display: "scalar",
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const card = await createNativeCard(mb.api, question);
    await visitQuestion(page, card.id);
  });

  test("question field filter shows all tables from a selected database (metabase#19451)", async ({
    page,
  }) => {
    await page.getByText("Open Editor", { exact: true }).click();
    // `cy.icon("variable")` — unscoped, first match.
    await icon(page, "variable").first().click();

    // ANCHOR. This replaces a `page.waitForResponse` on
    // `/api/table/<PRODUCTS_ID>/query_metadata`, which is NOT a sound anchor:
    // `getTableQueryMetadata` is an RTK Query CACHED endpoint
    // (frontend/src/metabase/api/table.ts), so when loading the question has
    // already fetched that table, opening the variable sidebar re-renders from
    // the cache and issues NO second request — the wait then blocks for its
    // full 30s. That is exactly the observed CI failure
    // (`page.waitForResponse: Timeout 30000ms exceeded`), and it is a race the
    // local dev backend happens to lose in the other direction.
    //
    // The cache-independent signal is the widget itself. `FieldMappingSelect`
    // renders the selector only once `field != null`, and `FieldTrigger`
    // renders the literal "Select..." until the field's table metadata
    // resolves — only then does it render the table display name ("Products")
    // and the field name. So the trigger showing "Products" IS
    // "metadata has loaded", which is precisely what upstream's retrying
    // `cy.findByText("Products")` waits on. Scoping to the tag editor sidebar
    // keeps it unambiguous: "Products" also appears in the data-reference
    // sidebar on this page, and an unscoped `.first()` can resolve to that one.
    const fieldTrigger = page
      .getByTestId("tag-editor-sidebar")
      .getByText("Products", { exact: true });
    await expect(fieldTrigger).toBeVisible();
    await fieldTrigger.click();
    await icon(page, "chevronleft").first().click();

    // The table list of the data-reference sidebar. Upstream's unscoped
    // `cy.findByText` is an existence assertion each; `.first()` reproduces
    // Cypress's first-match resolution where the label also appears elsewhere.
    await expect(
      page.getByText("Products", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Orders", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("People", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Reviews", { exact: true }).first(),
    ).toBeVisible();
  });
});

test.describe("issue 20044", () => {
  const questionDetails = {
    name: "20044",
    native: {
      query: "select 1",
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("nodata user should not see 'Explore results' (metabase#20044)", async ({
    mb,
    page,
  }) => {
    const card = await createNativeCard(mb.api, questionDetails);
    await mb.signIn("nodata");

    await visitQuestion(page, card.id);

    // `cy.get("[data-testid=cell-data]").contains("1")` — case-sensitive
    // substring, first match. Doubles as the ANCHOR for the absence check
    // below: the results table only paints once the card query resolved.
    await expect(
      page
        .locator("[data-testid=cell-data]")
        .filter({ hasText: caseSensitiveSubstring("1") })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByText("Explore results", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 20625", () => {
  // Upstream carries `{ tags: "@skip" }`, i.e. this describe is excluded from
  // every Cypress run ("realpress messes with cypress 13"). Ported in full so
  // the transcription is complete, but skipped for the same reason — un-skip
  // only together with upstream.
  test.skip(true, "upstream @skip: realpress messes with cypress 13");

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.put("/api/setting/native-query-autocomplete-match-style", {
      value: "prefix",
    });
    await mb.signInAsNormalUser();
  });

  const isAutocomplete = (url: string) =>
    /^\/api\/database\/[^/]+\/autocomplete_suggestions$/.test(
      new URL(url).pathname,
    );

  test("should continue to request more prefix matches from the server when the limit was hit (metabase#20625)", async ({
    page,
  }) => {
    const body = [
      // This result has 50 items, which is the limit
      // as set by the backend.
      // This is needed to trigger the second autocomplete.
      ["ORDERS", "Table"],
      ["PEOPLE", "Table"],
      ["REVIEWS", "Table"],
      ["ACTIVE_SUBSCRIPTION", "ACCOUNTS :type/Boolean :type/Category"],
      ["ADDRESS", "PEOPLE :type/Text"],
      ["BIRTH_DATE", "PEOPLE :type/Date"],
      ["BUTTON_LABEL", "ANALYTIC_EVENTS :type/Text :type/Category"],
      ["CANCELED_AT", "ACCOUNTS :type/DateTime :type/CancelationTimestamp"],
      ["CATEGORY", "PRODUCTS :type/Text :type/Category"],
      ["CREATED_AT", "ACCOUNTS :type/DateTime :type/CreationTimestamp"],
      ["CREATED_AT", "ORDERS :type/DateTime :type/CreationTimestamp"],
      ["CREATED_AT", "PEOPLE :type/DateTime :type/CreationTimestamp"],
      ["CREATED_AT", "PRODUCTS :type/DateTime :type/CreationTimestamp"],
      ["CREATED_AT", "REVIEWS :type/DateTime :type/CreationTimestamp"],
      ["DATE_RECEIVED", "FEEDBACK :type/DateTime"],
      ["DATE_RECEIVED", "INVOICES :type/DateTime"],
      ["EAN", "PRODUCTS :type/Text"],
      ["EMAIL", "ACCOUNTS :type/Text :type/Email"],
      ["EMAIL", "FEEDBACK :type/Text :type/Email"],
      ["EMAIL", "PEOPLE :type/Text :type/Email"],
      ["EVENT", "ANALYTIC_EVENTS :type/Text :type/Category"],
      ["EXPECTED_INVOICE", "INVOICES :type/Boolean :type/Category"],
      ["FIRST_NAME", "ACCOUNTS :type/Text :type/Name"],
      ["LAST_NAME", "ACCOUNTS :type/Text :type/Name"],
      ["LATITUDE", "ACCOUNTS :type/Float :type/Latitude"],
      ["LATITUDE", "PEOPLE :type/Float :type/Latitude"],
      ["LEGACY_PLAN", "ACCOUNTS :type/Boolean :type/Category"],
      ["LONGITUDE", "ACCOUNTS :type/Float :type/Longitude"],
      ["LONGITUDE", "PEOPLE :type/Float :type/Longitude"],
      ["NAME", "PEOPLE :type/Text :type/Name"],
      ["PAGE_URL", "ANALYTIC_EVENTS :type/Text :type/URL"],
      ["PAYMENT", "INVOICES :type/Float"],
      ["PRICE", "PRODUCTS :type/Float"],
      ["RATING_MAPPED", "FEEDBACK :type/Text :type/Category"],
      ["REVIEWER", "REVIEWS :type/Text"],
      ["SEATS", "ACCOUNTS :type/Integer"],
      ["SOURCE", "ACCOUNTS :type/Text :type/Source"],
      ["SOURCE", "PEOPLE :type/Text :type/Source"],
      ["STATE", "PEOPLE :type/Text :type/State"],
      ["TIMESTAMP", "ANALYTIC_EVENTS :type/DateTime"],
      ["TITLE", "PRODUCTS :type/Text :type/Title"],
      ["TRIAL_CONVERTED", "ACCOUNTS :type/Boolean :type/Category"],
      ["TRIAL_ENDS_AT", "ACCOUNTS :type/DateTime"],
      ["USER_ID", "ORDERS :type/Integer :type/FK"],
      ["VENDOR", "PRODUCTS :type/Text :type/Company"],
      ["VENDOR_ID", "PRODUCTS :type/Integer :type/FK"],
      ["USER_NAME", "PRODUCTS :type/Text :type/Name"],
      ["TEST_COLUMN_1", "PRODUCTS :type/Text :type/Name"],
      ["TEST_COLUMN_2", "PRODUCTS :type/Text :type/Name"],
      ["TEST_COLUMN_3", "PRODUCTS :type/Text :type/Name"],
    ];
    await page.route(
      (url) => isAutocomplete(url.toString()),
      (route) => route.fulfill({ status: 200, json: body }),
    );
    const autocompletes = recordRequests(page, (request) =>
      isAutocomplete(request.url()),
    );

    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "e");

    // autocomplete_suggestions?prefix=s
    await expect.poll(() => autocompletes.length).toBeGreaterThanOrEqual(1);

    await typeInNativeEditor(page, "o");

    // autocomplete_suggestions?prefix=so
    await expect.poll(() => autocompletes.length).toBeGreaterThanOrEqual(2);
  });

  test("should not continue to request more prefix matches from the server when the limit was not hit (metabase#20625)", async ({
    page,
  }) => {
    const body = [
      // This result has less than 50 items, which is under the limit
      // as set by the backend.
      // It will not be necessary to trigger the second autocomplete.
      ["ORDERS", "Table"],
      ["PEOPLE", "Table"],
      ["REVIEWS", "Table"],
      ["ACTIVE_SUBSCRIPTION", "ACCOUNTS :type/Boolean :type/Category"],
      ["ADDRESS", "PEOPLE :type/Text"],
    ];
    await page.route(
      (url) => isAutocomplete(url.toString()),
      (route) => route.fulfill({ status: 200, json: body }),
    );
    const autocompletes = recordRequests(page, (request) =>
      isAutocomplete(request.url()),
    );

    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "e");

    // autocomplete_suggestions?prefix=s
    await expect.poll(() => autocompletes.length).toBeGreaterThanOrEqual(1);

    await typeInNativeEditor(page, "o");

    expect(autocompletes.length).toBe(1);
  });
});

test.describe("issue 21034", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not invoke API calls for autocomplete twice in a row (metabase#18148)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    // Upstream registers `cy.intercept(..., cy.spy().as("suggestions"))` AFTER
    // visiting, so requests fired during the visit are not counted. The spy is
    // a pass-through route handler; the Playwright equivalent is a passive
    // request counter installed at the same point.
    const suggestions = recordRequests(page, (request) =>
      isAutocompleteRequest(request, SAMPLE_DB_ID),
    );

    await typeInNativeEditor(page, "p");

    // Wait until another explicit autocomplete is triggered
    // (slightly longer than AUTOCOMPLETE_DEBOUNCE_DURATION)
    // See https://github.com/metabase/metabase/pull/20970
    await page.waitForTimeout(1000);

    expect(suggestions.length).toBe(1);
  });
});

test.describe("issue 21550", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not show scrollbars for very short snippet (metabase#21550)", async ({
    page,
  }) => {
    const rootCollection = () =>
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/collection/root/items",
      );

    await startNewNativeQuestion(page);

    let rootItems = rootCollection();
    await icon(page, "snippet").first().click();
    await rootItems;
    await page
      .getByTestId("sidebar-content")
      .getByText("Create snippet", { exact: true })
      .click();

    const snippetModal = modal(page);
    // findByLabelText is EXACT; getByLabel is a substring match (PORTING).
    // cy.type() clicks its subject first, then types at document.activeElement.
    const sqlField = snippetModal.getByLabel(
      "Enter some SQL here so you can reuse it later",
      { exact: true },
    );
    await sqlField.click();
    await page.keyboard.type("select * from people");
    const nameField = snippetModal.getByLabel("Give your snippet a name", {
      exact: true,
    });
    await nameField.click();
    await page.keyboard.type("people");
    rootItems = rootCollection();
    await snippetModal.getByText("Save", { exact: true }).click();
    await rootItems;

    const sidebar = page.getByTestId("sidebar-content");
    await sidebar.getByText("people", { exact: true }).hover();
    // `.click({ force: true })` on the hover-revealed chevron — a DISPATCH, so
    // the real cursor stays parked on the row and the chevron stays revealed.
    await icon(sidebar, "chevrondown").first().dispatchEvent("click");

    // `cy.get("pre").then(($pre) => ...)` — `$pre[0]` takes the FIRST match.
    const pre = page.locator("pre").first();
    await expect(pre).toBeVisible();
    const { preWidth, clientWidth } = await pre.evaluate((element) => ({
      preWidth: element.getBoundingClientRect().width,
      clientWidth: element.clientWidth,
    }));
    const BORDERS = 2; // 1px left and right
    // ⚠️ VACUOUS in this environment — kept verbatim, and vacuous UPSTREAM too
    // (chai's `expect(clientWidth).to.be.gte(preWidth - BORDERS)` reads the same
    // two DOM properties, so this is not port drift).
    //
    // Measured by mutation: forcing a 20-line snippet gives
    //   {preWidth:307, clientWidth:305, scrollWidth:305,
    //    clientH:318, scrollH:336, overflowX:"auto", overflowY:"auto",
    //    border:"1px/1px", whiteSpace:"pre-wrap"}
    // i.e. the <pre> IS vertically overflowing (scrollH 336 > clientH 318) and
    // the assertion still passes, because Chromium's scrollbars here are
    // OVERLAY scrollbars and consume no layout width. `clientWidth` is
    // therefore always exactly `preWidth - borderLeft - borderRight`, so
    // `clientWidth >= preWidth - 2` cannot go false. `white-space: pre-wrap`
    // separately rules out horizontal overflow (scrollWidth == clientWidth), so
    // a long single line cannot move it either.
    //
    // The check could only fail on a platform with classic, layout-consuming
    // scrollbars. Not strengthened here (that would exceed upstream); a
    // non-vacuous form would assert `scrollHeight <= clientHeight`.
    expect(clientWidth).toBeGreaterThanOrEqual(preWidth - BORDERS);
  });
});

test.describe("issue 31926", { tag: "@external" }, () => {
  // The one genuinely container-dependent describe in this file:
  // H.addPostgresDatabase connects to the QA Postgres on :5404.
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  const databaseName = "Sample Database";
  const databaseCopyName = `${databaseName} copy`;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("display the relevant error message in save question modal (metabase#21597)", async ({
    mb,
    page,
  }) => {
    // Upstream's bare `cy.intercept({ method: "POST", url: "/api/card" })` has
    // no alias and is never awaited — dropped (PORTING rule 2).

    // Second DB (copy)
    await addPostgresDatabase(mb.api, databaseCopyName);

    // Create a native query and run it
    await startNewNativeQuestion(page);
    await typeInNativeEditor(
      page,
      "SELECT COUNT(*) FROM PRODUCTS WHERE {{FILTER}}",
    );

    await page.getByTestId("variable-type-select").click();
    await popover(page).getByText("Field Filter", { exact: true }).click();
    await popover(page).getByText("Products", { exact: true }).click();
    await popover(page).getByText("Category", { exact: true }).click();

    await icon(
      page.getByTestId("native-query-editor-container"),
      "play",
    ).click();
    // cy.contains("200") — case-sensitive substring, first match.
    await expect(
      page.getByText(caseSensitiveSubstring("200")).first(),
    ).toBeVisible();

    // Change DB
    // and re-run the native query
    await page
      .getByTestId("native-query-editor-container")
      .getByText(databaseName, { exact: true })
      .click();
    await popover(page).getByText(databaseCopyName, { exact: true }).click();

    // run button disabled
    // `findAllByTestId(...).filter(":visible").should("be.disabled")` is an
    // ANY-of-set assertion (PORTING rule 3).
    await expect(
      page.getByTestId("run-button").filter({ visible: true }).first(),
    ).toBeDisabled();

    // Try to save the native query
    // save button disabled
    await expect(page.getByTestId("qb-save-button")).toHaveAttribute(
      "data-disabled",
      "true",
    );
  });
});

test.describe("issue 21597", () => {
  /*
   *
   * Greetings and welcome to this weird test. It has a history! A long legacy! Allow me to explain:
   *
   * This test was originally using changing the DB on a native query with field filters to trigger an error that
   * would show up in the save modal.
   *
   * PR#54453 fixes this error by removing the field filters that refer to the old database, which means that it won't
   * save.
   *
   * So in order to trigger an error, we are intercepting the POST /api/card and manually responding with an error.
   *
   * We then assert that the message makes it to the save modal.
   *
   * The End
   */
  // ⚠️ Upstream still carries `{ tags: "@external" }`, but the rewrite above
  // deleted the only reason for it: no second database, no QA container, no
  // writable DB — just `SELECT 1` and a mocked `POST /api/card`. The tag is
  // STALE and the describe is deliberately left ungated (gating on it would
  // skip a test that runs fine on the bare jar).
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("display the relevant error message in save question modal (metabase#21597)", async ({
    page,
  }) => {
    const message =
      'Invalid Field Filter: Field 164574 "PRODUCTS"."CATEGORY" belongs to Database 2276 "sample-dataset", but the query is against Database 2275 "test-data"';
    const isSaveCard = (url: string, method: string) =>
      method === "POST" && new URL(url).pathname === "/api/card";
    await page.route(
      (url) => new URL(url.toString()).pathname === "/api/card",
      async (route, request) => {
        if (request.method() !== "POST") {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 400,
          json: { message, _status: 400 },
        });
      },
    );

    // Create a native query and run it
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "SELECT 1");

    // Try to save the native query
    await page
      .getByTestId("qb-header-action-panel")
      .getByText("Save", { exact: true })
      .click();

    const saveModal = modal(page);
    // findByPlaceholderText normalizes whitespace; this placeholder has none
    // to normalize, so getByPlaceholder is equivalent here.
    const nameInput = saveModal.getByPlaceholder(
      "What is the name of your question?",
    );
    await nameInput.click();
    await page.keyboard.type("The question name");

    const saveNativeQuestion = page.waitForResponse((response) =>
      isSaveCard(response.url(), response.request().method()),
    );
    await saveModal.getByText("Save", { exact: true }).click();
    await saveNativeQuestion;
    await expect(saveModal.getByText(message, { exact: true })).toBeVisible();
  });
});

test.describe("issue 23510", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("loads metadata when it is not cached (metabase#23510)", async ({
    mb,
    page,
  }) => {
    const card = await createNativeCard(mb.api, {
      database: 1,
      name: "Q23510",
      native: {
        query:
          "select count(*) from orders left join products on products.id=orders.product_id where {{category}}",
        "template-tags": {
          ID: {
            id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
            name: "Category",
            display_name: "Category",
            type: "dimension",
            dimension: ["field", PRODUCTS.CATEGORY, null],
            "widget-type": "category",
            default: null,
          },
        },
      },
      display: "scalar",
    });
    await visitQuestion(page, card.id);

    await page.getByText("Open Editor", { exact: true }).click();

    const sidebar = page.getByTestId("sidebar-content");
    await expect(sidebar.getByText("ORDERS", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("PRODUCTS", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("REVIEWS", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("PEOPLE", { exact: true })).toBeVisible();
    await expect(
      sidebar.getByText("Sample Database", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 30680", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not render native editor buttons when 'Columns' tab is open (metabase#30680)", async ({
    page,
  }) => {
    await startNewNativeModel(page, { query: "select 1" });
    await expect(page.getByTestId("editor-tabs-columns")).toBeDisabled();

    await runNativeQuery(page);
    await expect(page.getByTestId("editor-tabs-columns")).toBeEnabled();
    await page.getByTestId("editor-tabs-columns-name").click();

    // ANCHOR: the sidebar is what the Columns tab renders, and it exists only
    // once the tab has switched — so asserting it first gates the absence
    // check below on a completed re-render (upstream's own ordering).
    await expect(page.getByTestId("sidebar-content")).toBeAttached();
    await expect(
      page.getByTestId("native-query-editor-action-buttons"),
    ).toHaveCount(0);
  });
});

test.describe("issue 34330", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await startNewNativeQuestion(page);

    await clearBrowserCache(page);
  });

  test("should only call the autocompleter with all text typed (metabase#34330)", async ({
    page,
  }) => {
    const autocompletes = recordRequests(page, (request) =>
      isAutocompleteRequest(request, SAMPLE_DB_ID),
    );

    await expect(
      page
        .getByTestId("query-visualization-root")
        .getByText("Here's where your results will appear", { exact: true }),
    ).toBeVisible();

    await typeInNativeEditor(page, "SEAT");
    await expect(nativeEditorCompletion(page, "SEATS").first()).toBeVisible();

    await expect.poll(() => autocompletes.length).toBeGreaterThanOrEqual(1);
    expect(new URL(autocompletes[0]).searchParams.get("substring")).toBe(
      "SEAT",
    );

    // only one call to the autocompleter should have been made
    expect(autocompletes.length).toBe(1);
  });

  test("should call the autocompleter eventually, even when only 1 character was typed (metabase#34330)", async ({
    page,
  }) => {
    const autocompletes = recordRequests(page, (request) =>
      isAutocompleteRequest(request, SAMPLE_DB_ID),
    );

    await typeInNativeEditor(page, "S");
    await expect(nativeEditorCompletion(page, "SEATS").first()).toBeVisible();

    await expect.poll(() => autocompletes.length).toBeGreaterThanOrEqual(1);
    expect(new URL(autocompletes[0]).searchParams.get("substring")).toBe("S");

    // only one call to the autocompleter should have been made
    expect(autocompletes.length).toBe(1);
  });

  test("should call the autocompleter when backspacing to a 1-character prefix (metabase#34330)", async ({
    page,
  }) => {
    const autocompletes = recordRequests(page, (request) =>
      isAutocompleteRequest(request, SAMPLE_DB_ID),
    );

    // `H.NativeEditor.type("SEAT{backspace}")` — `{backspace}` is an escape
    // sequence, i.e. type SEAT then press Backspace.
    await typeInNativeEditor(page, "SEAT");
    await page.keyboard.press("Backspace");
    await expect(nativeEditorCompletion(page, "SEATS").first()).toBeVisible();

    await expect.poll(() => autocompletes.length).toBeGreaterThanOrEqual(1);
    expect(new URL(autocompletes[0]).searchParams.get("substring")).toBe("SEA");

    // only one call to the autocompleter should have been made
    expect(autocompletes.length).toBe(1);
  });
});

test.describe("issue 35344", () => {
  const questionDetails = {
    name: "REVIEWS SQL",
    native: { query: "select REVIEWER from REVIEWS" },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not allow the user to undo to the empty editor (metabase#35344)", async ({
    mb,
    page,
  }) => {
    const card = await createNativeCard(mb.api, questionDetails);
    await visitQuestion(page, card.id);

    await queryBuilderMain(page)
      .getByText("Open Editor", { exact: true })
      .click();

    // make sure normal undo still works
    await typeInNativeEditor(page, "--");
    // Upstream writes `expect(H.NativeEditor.get().findByText("--")).to.exist`.
    // The chai `to.exist` is VACUOUS (a Cypress chainable always exists) — but
    // calling `.findByText()` ENQUEUES the command, and a testing-library
    // findBy* throws when it resolves nothing. So the real, executing
    // assertion is "an element with exactly this text exists"; that is what is
    // ported, not the chai wrapper.
    await expect(nativeEditor(page).getByText("--", { exact: true })).toBeVisible();

    await focusNativeEditor(page);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(
      nativeEditor(page).getByText("--", { exact: true }),
    ).toHaveCount(0);

    // more undoing does not change to empty editor
    await focusNativeEditor(page);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(
      nativeEditor(page).getByText("select", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 35785", () => {
  const nativeQuery =
    "select * from products where created_at < {{max_date}} and created_at > {{from}} limit 5";

  const questionDetails = {
    native: {
      query: nativeQuery,
      "template-tags": {
        max_date: {
          id: "32b7654f-38b1-2dfd-ded6-ed23c45ef5f6",
          name: "max_date",
          "display-name": "Max date",
          type: "date",
          default: "2030-01-01",
          required: true,
        },
        from: {
          id: "ddf7c404-38db-8b65-f90d-c6f4bd8127ec",
          name: "from",
          "display-name": "From",
          type: "date",
          default: "2025-10-02",
          required: true,
        },
      },
    },
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    const card = await createNativeCard(mb.api, questionDetails);
    await visitQuestion(page, card.id);
  });

  test("should not redirect to the value of 'from' URL parameter after saving (metabase#35785)", async ({
    page,
  }) => {
    // `cy.intercept("GET", "/api/search?*").as("getSearchResults")` is
    // registered in the beforeEach and awaited after the save — and cy.wait
    // consumes PAST responses, so it can be satisfied retroactively. Ported as
    // a passive recorder installed at the same point (PORTING).
    const searches = recordRequests(
      page,
      (request) =>
        request.method() === "GET" &&
        new URL(request.url()).pathname === "/api/search",
    );

    await page
      .getByTestId("native-query-editor-container")
      .getByTestId("visibility-toggler")
      .click();
    // `H.NativeEditor.type("{backspace}4")`
    await focusNativeEditor(page);
    await page.keyboard.press("Backspace");
    await page.keyboard.type("4", { delay: 10 });

    await page
      .getByTestId("qb-header")
      .getByRole("button", { name: "Save", exact: true })
      .click();

    await page
      .getByTestId("save-question-modal")
      .getByText("Save", { exact: true })
      .click();

    await expect.poll(() => searches.length).toBeGreaterThanOrEqual(1);

    // cy.url().should("include", ...) retries → expect.poll (PORTING).
    //
    // ⚠️ WEAK, faithfully so. Measured by mutation: deleting the save entirely
    // leaves this green, because the pre-save URL is already `/question/<id>`.
    // The guard only catches the specific #35785 bug (navigating to the value
    // of the `from` template tag, i.e. `/2025-10-02`) and passes for any other
    // outcome, including "nothing happened". Upstream's
    // `cy.url().should("include", "/question")` has exactly this property, so
    // it is left as-is rather than strengthened.
    await expect.poll(() => page.url()).toContain("/question");
  });
});

test.describe("issue 22991", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not show 'no permissions' screen when question with no access is referenced (metabase#22991)", async ({
    mb,
    page,
  }) => {
    const questionDetails = {
      name: "question 22991",
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
    };

    const restrictedCollection = await createCollection(mb.api, {
      name: "Restricted Collection",
    });
    await updateCollectionGraph(mb.api, {
      [USER_GROUPS.COLLECTION_GROUP]: {
        [restrictedCollection.id]: "none",
      },
    });
    const question = await createQuestion(mb.api, {
      ...questionDetails,
      collection_id: restrictedCollection.id,
    });

    await mb.signOut();
    await mb.signInAsNormalUser();

    await startNewNativeQuestion(page);
    // can't use cy.type because it does not simulate the bug
    await typeInNativeEditor(page, `select * from {{${question.id}}}`);

    // ANCHOR: the absence check below fires straight after typing, so it would
    // otherwise be satisfied by "the app hasn't reacted yet". Asserting the
    // card tag actually landed in the editor proves the keystrokes were
    // processed; the permission screen (if the bug were present) replaces
    // <main> in response to the tag's card fetch, which is issued from that
    // same update. A bounded settle follows for the fetch round trip.
    await expect(nativeEditor(page)).toContainText(`{{${question.id}}}`);
    await page.waitForTimeout(1000);

    // `cy.get("main").should("not.contain", x)` — `cy.get("main")` matches TWO
    // elements here (the app shell and query-builder-main), and chai-jquery's
    // bare `contain` on a multi-element subject is the ANY-OF case, so the
    // negation means "no matched element contains it". A plain
    // `expect(main(page)).not.toContainText(...)` is a strict-mode violation on
    // that same set; the filter form is the faithful negated any-of.
    // `contain` is case-SENSITIVE, hence the regex rather than a string.
    await expect(
      main(page).filter({
        hasText: caseSensitiveSubstring(
          "Sorry, you don’t have permission to see that",
        ),
      }),
    ).toHaveCount(0);
  });
});

test.describe("issue 46308", () => {
  const nativeQuery =
    "select category, count(*) from products where category != {{exclude}} group by category";

  const questionDetails = {
    native: {
      query: nativeQuery,
      "template-tags": {
        exclude: {
          id: "ddf7c404-38db-8b65-f90d-c6f4bd8127ec",
          name: "exclude",
          "display-name": "Exclude",
          type: "text",
        },
      },
    },
    display: "line",
    visualization_settings: {
      "graph.metrics": ["category"],
      "graph.dimensions": ["count"],
    },
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    // factories.createQuestion, not native-extras' createNativeCard: this card
    // needs `visualization_settings` in the POST, which createNativeCard
    // hardcodes to `{}`.
    const card = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, card.id);
  });

  test("should persist viz settings when saving a question without a required filter selected (metabase#46308)", async ({
    page,
  }) => {
    await page
      .getByTestId("native-query-editor-container")
      .getByTestId("visibility-toggler")
      .click();

    await icon(page, "variable").first().click();

    // `cy.get("input[value=Exclude]").eq(0).type(" Category").blur()`.
    // cy.type() clicks the subject first and appends at the end of the value.
    // The element handle is captured BEFORE typing: `input[value=Exclude]` is
    // an ATTRIBUTE selector, so if React rewrites the attribute the locator
    // would stop resolving and the trailing .blur() would deadlock (the
    // placeholder-trap family, PORTING).
    const excludeInput = page.locator("input[value=Exclude]").first();
    await expect(excludeInput).toBeVisible();
    const excludeHandle = await excludeInput.elementHandle();
    await excludeInput.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Category", { delay: 10 });
    await excludeHandle?.evaluate((element) =>
      (element as HTMLInputElement).blur(),
    );

    await page.getByTestId("qb-save-button").click();
    await page
      .getByTestId("save-question-modal")
      .getByText("Save", { exact: true })
      .click();

    // Native parameter widgets DROP their placeholder on focus — resolve once,
    // click, then type at the focused element (PORTING).
    const excludeWidget = page.getByPlaceholder("Exclude Category");
    await expect(excludeWidget).toBeVisible();
    await excludeWidget.click();
    await page.keyboard.type("Doohickey", { delay: 10 });

    const queryResponse = waitForQueryEitherEndpoint(page);
    await getRunQueryButton(page).click();
    await queryResponse;

    await expect(cartesianChartCircles(page)).toHaveCount(3);
  });
});

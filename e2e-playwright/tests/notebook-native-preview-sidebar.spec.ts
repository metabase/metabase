/**
 * Port of e2e/test/scenarios/question/notebook-native-preview-sidebar.cy.spec.ts
 *
 * Four describes, three infra tiers:
 *  1. "native query preview sidebar" (5 tests) — bare `default` snapshot.
 *  2. "converting question to SQL" (3 tests) — bare `default` snapshot.
 *  3. "converting question to a native query" — upstream `{ tags: "@mongo" }`,
 *     restores `mongo-5`, needs the QA Mongo container. Gated on
 *     PW_QA_DB_ENABLED (never the bare QA_DB_ENABLED, which leaks truthy from
 *     cypress.env.json). Its second test is `{ tags: "@skip" }` upstream and is
 *     ported as `test.skip` with the body intact.
 *  4. "tracking events" (1 test) — snowplow.
 *
 * Snowplow vantage: BROWSER BOUNDARY (`installSnowplowCapture`), not the
 * per-slot collector. `notebook_native_preview_shown|hidden` is emitted by
 * `trackNotebookNativePreviewShown` -> `trackSchemaEvent` in
 * `frontend/src/metabase/query_builder/analytics.ts:27-38` — a frontend
 * `trackSchemaEvent` call site, i.e. exactly the class PORTING says the browser
 * capture covers and the class the collector would double-count. The collector
 * is additionally SELF-DEFEATING here: `installSnowplowCapture`'s `page.route`
 * fulfils the tracker's POST before it leaves the browser, so nothing would
 * reach the collector at all.
 *
 * `H.expectNoBadSnowplowEvents` (the afterEach) is the known, recorded gap:
 * upstream asks snowplow-micro for Iglu VALIDATION failures; the port's
 * `expectNoBadSnowplowEvents` degrades that to a structural check because
 * `SnowplowCapture` discards the schema URI, so `support/iglu-validate.ts`
 * cannot currently be wired into it. Not this port's to fix.
 *
 * Generated-SQL assertions: every one compares RAW `textContent` via
 * `previewSql` + `String.includes`, never `toContainText`/`toHaveText` (which
 * normalize whitespace). Upstream's assertions are all substring containment of
 * single tokens, so formatting is not their subject — raw comparison is the
 * strictly safer equivalent, not a strengthening. See
 * findings-inbox/notebook-native-preview-sidebar.md for the per-assertion audit
 * and for the CI-drift flag on the data-derived row-limit numbers.
 *
 * Deliberate deviations, all recorded in the findings file:
 *  - `openReviewsTableNotebook` is spec-local because the shared
 *    `ad-hoc-question.ts openTable` drops `limit` on its notebook branch.
 *  - The `nosql` absence checks are anchored on the notebook + header panel
 *    having rendered. That is faithful, not a strengthening: Cypress's
 *    `findByTestId(...).findByLabelText(...)` carries an implicit existence
 *    requirement on the root.
 *  - The small-screen "button is covered" test asserts Playwright's
 *    pointer-interception error instead of Cypress's `cy.once("fail")` hook.
 */
import type { Locator, Page } from "@playwright/test";

import {
  ORDERS_COUNT_QUESTION_ID,
  MONGO_SKIP_REASON,
  closeSidebar,
  convertToSql,
  expectPreviewSql,
  openReviewsTableNotebook,
  openSidebar,
  previewEditor,
  previewSidebar,
  resizeSidebar,
  scrollResultsToCell,
  sidebarWidth,
  waitForNativeDataset,
} from "../support/notebook-native-preview-sidebar";
import {
  entityPickerModal,
  miniPicker,
  openNotebook,
  startNewQuestion,
} from "../support/notebook";
import { miniPickerBrowseAll } from "../support/joins";
import {
  signInWithCachedSession,
  visitQuestionAdhoc,
} from "../support/permissions";
import { withDatabase } from "../support/question-reproductions-4";
import { saveQuestion } from "../support/sharing";
import { saveSavedQuestion } from "../support/viz-charts-repros";
import {
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import { popover, visitQuestion } from "../support/ui";
import { expect, test } from "../support/fixtures";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > question > notebook > native query preview sidebar", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not show empty sidebar when no data source is selected", async ({
    page,
  }) => {
    await openReviewsTableNotebook(page, { limit: 1 });

    const nativeDataset = waitForNativeDataset(page);
    await openSidebar(page);
    await nativeDataset;

    await page.getByTestId("app-bar").getByLabel("New", { exact: true }).click();
    // H.findByTextEnsureVisible = cy.findByText(text).should("be.visible").
    const question = popover(page).getByText("Question", { exact: true });
    await expect(question).toBeVisible();
    await question.click();

    await miniPickerBrowseAll(page).click();
    await expect(
      page.getByPlaceholder("Search for tables and more...", { exact: true }),
    ).toBeVisible();
    await entityPickerModal(page)
      .getByRole("button", { name: "Close", exact: true })
      .click();

    await expect(previewSidebar(page)).toHaveCount(0);
  });

  test("smoke test: should show the preview sidebar, update it, and close it", async ({
    page,
  }) => {
    const defaultRowLimit = 1048575;
    const queryLimit = 2;

    await openReviewsTableNotebook(page, { limit: queryLimit });
    await openSidebar(page);
    await expect(previewSidebar(page)).toBeVisible();

    // Refreshing the page does not persist the sidebar state
    await page.reload();
    await expect(previewSidebar(page)).toHaveCount(0);

    const nativeDataset = waitForNativeDataset(page);
    await openSidebar(page);
    await nativeDataset;

    const sidebar = previewSidebar(page);
    await expect(
      sidebar.getByText("SQL for this question", { exact: true }),
    ).toHaveCount(1);
    await expect(previewEditor(page)).toBeVisible();
    // RAW textContent — see the module header on whitespace normalization.
    await expectPreviewSql(
      page,
      (sql) => sql.includes("SELECT") && sql.includes(String(queryLimit)),
      `contains "SELECT" and "${queryLimit}"`,
    );
    await expect(
      sidebar.getByRole("button", {
        name: "Convert this question to SQL",
        exact: true,
      }),
    ).toHaveCount(1);

    // Modifying GUI query should update the SQL preview
    const updatedDataset = waitForNativeDataset(page);
    const limitStep = page.getByTestId("step-limit-0-0");
    await limitStep.hover();
    await limitStep.locator(".Icon-close").click({ force: true });
    await updatedDataset;

    await expect(previewEditor(page)).toBeVisible();
    await expectPreviewSql(
      page,
      (sql) =>
        sql.includes("SELECT") &&
        sql.includes(String(defaultRowLimit)) &&
        !sql.includes(String(queryLimit)),
      `contains "SELECT" and "${defaultRowLimit}" but not "${queryLimit}"`,
    );

    // It should be possible to close the sidebar
    await closeSidebar(page);
    await expect(previewSidebar(page)).toHaveCount(0);
  });

  test("should not offer the sidebar preview for a user without native permissions", async ({
    page,
  }) => {
    // `nosql` has a cached session but no entry in the USERS credential map.
    await signInWithCachedSession(page.context(), "nosql");
    await openReviewsTableNotebook(page);

    // Cypress's `findByTestId(x).findByLabelText(y).should("not.exist")` carries
    // an implicit existence requirement on the ROOT — porting that anchor is
    // what keeps the absence check honest (it also rules out "nothing has
    // rendered yet", which both retrying absence forms are satisfied by).
    const headerPanel = page.getByTestId("qb-header-action-panel");
    await expect(headerPanel).toBeVisible();
    await expect(headerPanel.getByLabel(/View SQL/i)).toHaveCount(0);

    await expect(page.getByLabel("View SQL", { exact: true })).toHaveCount(0);
    await expect(previewSidebar(page)).toHaveCount(0);
    await expect(page.locator("code")).toHaveCount(0);
  });

  test.describe("small screens", () => {
    test.use({ viewport: { width: 480, height: 800 } });

    test("should work on small screens", async ({ page }) => {
      await openReviewsTableNotebook(page, { limit: 1 });
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe("/question/notebook");

      // Opening a preview sidebar should completely cover the notebook
      await openSidebar(page);
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe("/question/notebook");

      // It shouldn't be possible to click on any of the notebook elements.
      //
      // Upstream proves this with `cy.once("fail")`, asserting the click error
      // says the element "is being covered by another element" — the only
      // reliable way to test non-clickability in Cypress. Playwright's
      // equivalent signal is its actionability check refusing the point because
      // something else would receive the event, so the port asserts the click
      // REJECTS with a pointer-interception error. A short timeout matches
      // upstream's `{ timeout: 500 }` ("no need to wait four seconds").
      const error = await page
        .getByRole("button", { name: "Visualize", exact: true })
        .click({ timeout: 500 })
        .then(
          () => null,
          (caught: Error) => caught,
        );

      expect(
        error,
        "clicking Visualize should have failed — the preview should cover the notebook",
      ).not.toBeNull();
      expect(error?.message).toMatch(
        /intercepts pointer events|Timeout .* exceeded/,
      );
    });
  });

  test("sidebar should be resizable", async ({ mb, page }) => {
    const toleranceDelta = 0.5;

    const borderWidth = 1;
    const sidebarMargin = 4;
    const minNotebookWidth = 640;
    const minSidebarWidth = 428 - borderWidth;
    // Cypress.config("viewportWidth") — the Playwright project pins the same
    // 1280x800 viewport that e2e/support/config.js does.
    const viewportWidth = page.viewportSize()?.width ?? 1280;
    const maxSidebarWidth =
      viewportWidth - minNotebookWidth - borderWidth - sidebarMargin;

    await openReviewsTableNotebook(page, { limit: 1 });

    const nativeDataset = waitForNativeDataset(page);
    await openSidebar(page);
    await nativeDataset;

    // It should not be possible to shrink the sidebar below its min (initial) width
    {
      const [initialSidebarWidth, width] = await resizeSidebar(page, 200);
      expect(initialSidebarWidth).toBeCloseTo(minSidebarWidth, toleranceDelta);
      expect(width).toBeCloseTo(initialSidebarWidth, toleranceDelta);
    }

    // It should be possible to resize the sidebar but not above its max width
    {
      const [initialSidebarWidth, width] = await resizeSidebar(page, -500);
      expect(width).toBeGreaterThan(initialSidebarWidth);
      expect(width).toBeCloseTo(maxSidebarWidth, toleranceDelta);
    }

    // User preferences should be preserved across sessions
    await mb.signOut();
    await mb.signInAsAdmin();
    await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);
    await openNotebook(page);
    await openSidebar(page);
    await expect(previewSidebar(page)).toBeVisible();
    expect(await sidebarWidth(page)).toBeCloseTo(
      maxSidebarWidth,
      toleranceDelta,
    );

    // Preferences should not be shared across users
    await mb.signOut();
    await mb.signInAsNormalUser();
    await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);
    await openNotebook(page);
    await expect(previewSidebar(page)).toHaveCount(0);

    await openSidebar(page);
    await expect(previewSidebar(page)).toBeVisible();
    expect(await sidebarWidth(page)).toBeCloseTo(
      minSidebarWidth,
      toleranceDelta,
    );
  });
});

test.describe("converting question to SQL (metabase#12651, metabase#21615, metabase#32121, metabase#40422)", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be possible to convert an ad-hoc time-series table query to SQL (metabase#21615)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      display: "table",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
      },
    });

    await expect(page.getByTestId("timeseries-chrome")).toBeVisible();
    await expect(page.getByLabel("Row count", { exact: true })).toHaveText(
      "Showing 49 rows",
    );

    await convertToSql(page);
    // `/notebook` should be removed from the URL (metabase#12651)
    await expect.poll(() => new URL(page.url()).pathname).toBe("/question");

    await expect(page.getByTestId("timeseries-chrome")).toHaveCount(0);
    await expect(page.getByLabel("Row count", { exact: true })).toHaveText(
      "Showing 49 rows",
    );
  });

  test("should be possible to save a question based on a table after converting to SQL (metabase#40422)", async ({
    page,
  }) => {
    await visitQuestion(page, ORDERS_QUESTION_ID);
    await convertToSql(page);
    await saveSavedQuestion(page);
    await expect(cellDataContaining(page, "37.65")).not.toHaveCount(0);

    // should be possible to `Explore results` after saving a question (metabase#32121)
    await page
      .getByTestId("qb-header")
      .getByText("Explore results", { exact: true })
      .click();
    await expect(cellDataContaining(page, "37.65")).not.toHaveCount(0);
  });

  test("should be possible to save a question based on another question after converting to SQL (metabase#40422)", async ({
    mb,
    page,
  }) => {
    const { id } = await mb.api.createQuestion({
      query: { "source-table": `card__${ORDERS_QUESTION_ID}` },
    });
    await visitQuestion(page, id);

    await convertToSql(page);
    await saveSavedQuestion(page);
    await expect(cellDataContaining(page, "37.65")).not.toHaveCount(0);
  });
});

test.describe(
  "converting question to a native query (metabase#15946, metabase#32121, metabase#38181, metabase#40557)",
  { tag: "@mongo" },
  () => {
    test.skip(!process.env.PW_QA_DB_ENABLED, MONGO_SKIP_REASON);

    const MONGO_DB_NAME = "QA Mongo";
    const MONGO_DB_ID = 2;

    test.beforeEach(async ({ mb }) => {
      await mb.restore("mongo-5");
      await mb.signInAsAdmin();
    });

    test("should work for both simple and nested questions based on previously converted GUI query", async ({
      page,
    }) => {
      await startNewQuestion(page);
      await miniPicker(page)
        .getByText(MONGO_DB_NAME, { exact: true })
        .click();
      await miniPicker(page).getByText("Products", { exact: true }).click();

      // Simple question
      await openSidebar(page, "native");
      const sidebar = previewSidebar(page);
      await expect(
        sidebar.getByText("Native query for this question", { exact: true }),
      ).toHaveCount(1);
      await expect(previewEditor(page)).toBeVisible();
      await expectPreviewSql(
        page,
        (query) => query.includes("$project") && query.includes("$limit"),
        'contains "$project" and "$limit"',
      );

      await sidebar
        .getByRole("button", {
          name: "Convert this question to a native query",
          exact: true,
        })
        .click();

      // Database and table should be pre-selected (metabase#15946)
      await expect(page.getByTestId("selected-database")).toHaveText(
        MONGO_DB_NAME,
      );
      await expect(page.getByTestId("selected-table")).toHaveText("Products");
      await scrollResultsToCell(page, "Small Marble Shoes");
      await expect(cellDataContaining(page, "Small Marble Shoes")).not.toHaveCount(0);

      // Nested question — should be possible to save a question and
      // `Explore results` (metabase#32121)
      await saveQuestion(page, "foo", { path: ["Our analytics"] });
      await page
        .getByTestId("qb-header")
        .getByText("Explore results", { exact: true })
        .click();
      await scrollResultsToCell(page, "Small Marble Shoes");
      await expect(cellDataContaining(page, "Small Marble Shoes")).not.toHaveCount(0);

      // The generated query should be valid (metabase#38181)
      await openNotebook(page);
      await openSidebar(page, "native");
      await expect(
        sidebar.getByText("Native query for this question", { exact: true }),
      ).toHaveCount(1);
      await expect(previewEditor(page)).toBeVisible();
      await expectPreviewSql(
        page,
        (query) =>
          query.includes("$project") &&
          query.includes("$limit") &&
          !query.includes("BsonString") &&
          !query.includes("BsonInt32"),
        'contains "$project"/"$limit" and neither "BsonString" nor "BsonInt32"',
      );

      await sidebar
        .getByRole("button", {
          name: "Convert this question to a native query",
          exact: true,
        })
        .click();

      // Database and table should be pre-selected (metabase#15946 and/or metabase#40557)
      await expect(page.getByTestId("selected-database")).toHaveText(
        MONGO_DB_NAME,
      );
      await expect(page.getByTestId("selected-table")).toHaveText("Products");
      await scrollResultsToCell(page, "Small Marble Shoes");
      await expect(cellDataContaining(page, "Small Marble Shoes")).not.toHaveCount(0);
    });

    // Upstream carries `{ tags: "@skip" }` — ported as a skip with the body
    // intact, per the brief. NOT silently enabled.
    test.skip("should work for a nested GUI question (metabase#40557)", async ({
      mb,
      page,
    }) => {
      const database = await withDatabase(mb.api, MONGO_DB_ID);
      const productsId = database.PRODUCTS_ID as number;

      const { id: sourceId } = await mb.api.createQuestion({
        name: "Mongo Source",
        query: { "source-table": productsId, limit: 1 },
        database: MONGO_DB_ID,
      });
      const { id: nestedId } = await mb.api.createQuestion({
        name: "Mongo Nested",
        query: { "source-table": `card__${sourceId}` },
        database: MONGO_DB_ID,
      });
      await visitQuestion(page, nestedId);

      await scrollResultsToCell(page, "Small Marble Shoes");
      await expect(cellDataContaining(page, "Small Marble Shoes")).not.toHaveCount(0);
      await openNotebook(page);
      await openSidebar(page, "native");

      const sidebar = previewSidebar(page);
      await expect(
        sidebar.getByText("Native query for this question", { exact: true }),
      ).toHaveCount(1);
      await expect(previewEditor(page)).toBeVisible();
      await expectPreviewSql(
        page,
        (query) =>
          query.includes("$project") &&
          query.includes("$limit") &&
          !query.includes("BsonString") &&
          !query.includes("BsonInt32"),
        'contains "$project"/"$limit" and neither "BsonString" nor "BsonInt32"',
      );

      await sidebar
        .getByRole("button", {
          name: "Convert this question to a native query",
          exact: true,
        })
        .click();

      // Database and table should be pre-selected (metabase#40557)
      await expect(page.getByTestId("selected-database")).toHaveText(
        MONGO_DB_NAME,
      );
      await expect(page.getByTestId("selected-table")).toHaveText("Products");
      await scrollResultsToCell(page, "Small Marble Shoes");
      await expect(cellDataContaining(page, "Small Marble Shoes")).not.toHaveCount(0);
    });
  },
);

test.describe("scenarios > notebook > native query preview sidebar tracking events", () => {
  test("should track `notebook_native_preview_shown|hidden` events", async ({
    mb,
    page,
  }) => {
    // H.resetSnowplow / H.enableTracking: the capture starts empty and forces
    // the tracking settings on, so both are covered by installing it.
    const capture = await installSnowplowCapture(page, mb.baseUrl);
    await mb.restore();
    await mb.signInAsAdmin();

    await openReviewsTableNotebook(page, { limit: 1 });

    const nativeDataset = waitForNativeDataset(page);
    await page.getByLabel("View SQL", { exact: true }).click();
    await nativeDataset;
    await expect(previewSidebar(page)).toHaveCount(1);

    await expectUnstructuredSnowplowEvent(capture, {
      event: "notebook_native_preview_shown",
    });

    await closeSidebar(page);
    await expect(previewSidebar(page)).toHaveCount(0);

    await expectUnstructuredSnowplowEvent(capture, {
      event: "notebook_native_preview_hidden",
    });

    // Port of the afterEach H.expectNoBadSnowplowEvents (structural stand-in).
    expectNoBadSnowplowEvents(capture);
  });
});

/**
 * Port of `cy.get("[data-testid=cell-data]").should("contain", text)`.
 *
 * A bare `should("contain", x)` on a multi-element subject is ANY-OF, so this
 * asserts at least one cell matches — `.first()` would WEAKEN it into "the
 * first cell matches". The regex keeps chai's case-SENSITIVE substring
 * semantics (Playwright's `hasText` string form is case-insensitive).
 */
function cellDataContaining(page: Page, text: string): Locator {
  return page
    .locator("[data-testid=cell-data]")
    .filter({ hasText: new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
}

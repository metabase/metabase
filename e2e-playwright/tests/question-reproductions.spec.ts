/**
 * Playwright port of
 * e2e/test/scenarios/question-reproductions/reproductions.cy.spec.ts
 *
 * 24 independent question-builder regression guards across 19 describes. The
 * repetition IS the coverage — nothing here is merged or consolidated.
 *
 * NOTE on the target filename: the source directory also holds
 * `reproductions-1/-2/-3/-4.cy.spec.js`, but there is **no**
 * `reproductions.cy.spec.js` twin of this `.ts` source, and no pre-existing
 * `tests/question-reproductions.spec.ts`. (Checked per the
 * visualizations-charts precedent in PORTING.md.)
 *
 * Porting notes:
 * - `cy.intercept(...).as(x)` + `cy.wait("@x")` → `waitForResponse` registered
 *   BEFORE the triggering action (PORTING rule 2).
 * - `findByText(string)` / `findByLabelText(string)` are EXACT
 *   testing-library matches → `{ exact: true }`; `cy.button(name)` →
 *   `getByRole("button", { name, exact: true })` (see
 *   e2e/support/commands/ui/button.ts — it is `findByRole` under the hood);
 *   `cy.icon(name)` → `.Icon-<name>`; `cy.contains(str)` → case-sensitive
 *   substring regex + `.first()`.
 * - `cy.findAllByRole(...).should("be.visible")` is an ANY-of-set assertion
 *   (rule 3) → `.filter({ visible: true }).first()`.
 * - "Switch to data" / "Switch to visualization" are `QuestionDisplayToggle`,
 *   whose SegmentedControl items are `disabled: true` by design while the
 *   control ROOT handles the click. Playwright reads `disabled` off ancestors,
 *   so those need `click({ force: true })`. This is scoped to that control
 *   only — the `view-footer` "Visualization" chart-type button is a different
 *   element and takes a plain click.
 *
 * Infra tier — MIXED, four of the nineteen describes need a container:
 * - `issue 47793` — `@external @mongo`, restores `mongo-5`, queries the mongo
 *   QA database (database 2).
 * - `54205` — restores `postgres-writable` and DDLs `public.products` in the
 *   shared writable container. **Untagged upstream** despite needing the QA
 *   Postgres, so the gate here is deliberate, not transcribed.
 * - `issue 13347` — restores `postgres-12` and creates cards on database 2.
 * - `issue #47005` — restores `postgres-12` and then never touches it. Gated
 *   anyway (the restore itself needs the snapshot); flagged as a candidate for
 *   the "audit a spec's snapshot dependencies" pass in PORTING.md, which would
 *   free its one test onto the bare jar.
 * The other fifteen describes run entirely on the H2 sample database.
 *
 * FINDINGS-worthy: issue 39487's `assertPreviousButtonRectDidNotChange` /
 * `assertNextButtonRectDidNotChange` are VACUOUS upstream — see the analysis
 * on `assertNoLayoutShift` in support/question-reproductions.ts.
 *
 * Spec-local helpers live in support/question-reproductions.ts.
 */
import { expect, test } from "../support/fixtures";
import { openOrdersTable, openProductsTable } from "../support/ad-hoc-question";
import {
  WRITABLE_DB_ID,
  getTableId,
  resyncDatabase,
} from "../support/schema-viewer";
import { queryWritableDB } from "../support/actions-on-dashboards";
import { DATA_GROUP } from "../support/admin-permissions";
import { updatePermissionsGraph } from "../support/dashboard-repros";
import { pickEntity } from "../support/entity-picker";
import { createNativeQuestion, createQuestion } from "../support/factories";
import { queryBuilderFooter } from "../support/filter-bulk";
import { filterNotebook, join, miniPickerBrowseAll } from "../support/joins";
import { ensureChartIsActive } from "../support/metrics-explorer";
import { visitModel } from "../support/models";
import {
  mapColumnTo,
  openColumnOptions,
  renameColumn,
} from "../support/models-metadata";
import { saveMetadataChanges } from "../support/models-reproductions-2";
import { filter as filterSimple } from "../support/nested-questions";
import {
  assertQueryBuilderRowCount,
  entityPickerModalLevel,
  getNotebookStep,
  miniPicker,
  openNotebook,
  queryBuilderMain,
  startNewQuestion,
  tableHeaderClick,
  visualize,
} from "../support/notebook";
import { entityPickerModalItem } from "../support/question-new";
import { ORDERS_QUESTION_ID, SAMPLE_DATABASE } from "../support/sample-data";
import { createCard, createTestQuery } from "../support/summarization";
import {
  icon,
  main,
  modal,
  popover,
  queryBuilderHeader,
  visitQuestion,
} from "../support/ui";
import {
  MONGO_SKIP_REASON,
  QA_DB_SKIP_REASON,
  checkDateRangeFilter,
  checkSingleDateFilter,
  clearAndType,
  createMockParameter,
  datePickerPreviousButton,
  ensureParameterColumnValue,
  expectCypressHidden,
  findByDisplayValue,
  getSyncedFieldId,
  mainAside,
  miniPickerOurAnalytics,
  runButtonOverlay,
  updateSetting,
  waitForCreateCard,
  waitForUpdateCard,
} from "../support/question-reproductions";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

test.describe("issue 39487", () => {
  const CREATED_AT_FIELD = [
    "field",
    ORDERS.CREATED_AT,
    { "base-type": "type/DateTime" },
  ];

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  async function createTimeSeriesQuestionWithFilter(
    api: Parameters<typeof createQuestion>[0],
    page: Parameters<typeof visitQuestion>[0],
    filter: unknown[],
  ) {
    const { id } = await createQuestion(api, {
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        filter,
      },
      display: "line",
    });
    await visitQuestion(page, id);
  }

  test("calendar has constant size when using single date picker filter (metabase#39487)", async ({
    mb,
    page,
  }) => {
    // { viewportHeight: 1000 } — Cypress's default width (1280) is unchanged
    // and matches the Playwright config's.
    await page.setViewportSize({ width: 1280, height: 1000 });

    await createTimeSeriesQuestionWithFilter(mb.api, page, [
      ">",
      CREATED_AT_FIELD,
      "2015-01-01",
    ]); // 5 day rows

    // timeseries filter button
    await page.getByTestId("timeseries-filter-button").click();
    await checkSingleDateFilter(page);

    // filter pills
    await page.getByTestId("filters-visibility-control").click();
    await page.getByTestId("filter-pill").click();
    await checkSingleDateFilter(page);

    // filter picker
    await page.getByRole("button", { name: /Filter/ }).click();
    await popover(page).getByText("Created At", { exact: true }).click();
    await popover(page).getByText("Fixed date range…", { exact: true }).click();
    await checkSingleDateFilter(page);
    await page.keyboard.press("Escape");

    // filter drill
    await page
      .getByLabel("Switch to data", { exact: true })
      .click({ force: true });
    await tableHeaderClick(page, "Created At: Year");
    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();

    // verify that previous popover is closed before opening new one
    await expect(
      popover(page).getByText("Filter by this column", { exact: true }),
    ).toHaveCount(0);

    await popover(page).getByText("Fixed date range…", { exact: true }).click();
    await popover(page).getByText("After", { exact: true }).click();
    await clearAndType(popover(page).getByRole("textbox"), "2015/01/01");
    await checkSingleDateFilter(page);

    // notebook editor
    await openNotebook(page);
    await getNotebookStep(page, "filter")
      .getByTestId("notebook-cell-item")
      .first()
      .click();
    await checkSingleDateFilter(page);
  });

  test("calendar has constant size when using date range picker filter, and text inputs are in sync with the calendar inputs (metabase#39487, metabase#64602)", async ({
    mb,
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });

    await createTimeSeriesQuestionWithFilter(mb.api, page, [
      "between",
      CREATED_AT_FIELD,
      "2027-05-01", // 5 day rows
      "2027-06-01", // 6 day rows
    ]);

    // timeseries filter button
    await page.getByTestId("timeseries-filter-button").click();
    await checkDateRangeFilter(page);

    // filter pills
    await page.getByTestId("filters-visibility-control").click();
    await page.getByTestId("filter-pill").click();
    await checkDateRangeFilter(page);

    // filter dropdown
    await page.getByRole("button", { name: /Filter/ }).click();
    await popover(page).getByText("Created At", { exact: true }).click();
    await popover(page).getByText("Fixed date range…", { exact: true }).click();

    // changing text input values should navigate the calendars (metabase#64602)
    await clearAndType(
      popover(page).getByRole("textbox").first(),
      "2027/05/01",
    );
    await expect(
      popover(page).getByText("May 2027", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByLabel("1 May 2027", { exact: true }),
    ).toHaveAttribute("data-first-in-range", "true");

    await expect(popover(page).getByRole("textbox")).toHaveCount(2);
    await clearAndType(popover(page).getByRole("textbox").last(), "2027/06/01");
    const juneFirst = popover(page)
      .getByLabel("1 June 2027", { exact: true })
      .filter({ visible: true });
    await expect(juneFirst).toHaveCount(1);
    await expect(juneFirst).toHaveAttribute("data-last-in-range", "true");

    await datePickerPreviousButton(page).click();
    await checkDateRangeFilter(page);
    await page.keyboard.press("Escape");

    // filter drill
    await page
      .getByLabel("Switch to data", { exact: true })
      .click({ force: true });
    await tableHeaderClick(page, "Created At: Year");
    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();
    await popover(page).getByText("Fixed date range…", { exact: true }).click();
    await clearAndType(
      popover(page).getByRole("textbox").first(),
      "2027/05/01",
    );
    await expect(popover(page).getByRole("textbox")).toHaveCount(2);
    await clearAndType(popover(page).getByRole("textbox").last(), "2027/06/01");
    await datePickerPreviousButton(page).click();
    await checkDateRangeFilter(page);

    // notebook editor
    await openNotebook(page);
    await getNotebookStep(page, "filter")
      .getByTestId("notebook-cell-item")
      .first()
      .click();
    await checkDateRangeFilter(page);
  });

  test("date picker is scrollable when overflows (metabase#39487)", async ({
    mb,
    page,
  }) => {
    await createTimeSeriesQuestionWithFilter(mb.api, page, [
      ">",
      CREATED_AT_FIELD,
      "2015-03-01", // 6 day rows
    ]);

    await openNotebook(page);
    await getNotebookStep(page, "filter")
      .getByTestId("notebook-cell-item")
      .first()
      .click();

    // cy.scrollTo("bottom") is a plain scrollTop assignment (jQuery .animate
    // with no duration); `reducedMotion: reduce` would skip a smooth scroll.
    await popover(page)
      .getByTestId("popover-content")
      .evaluate((el: HTMLElement) => {
        el.scrollTop = el.scrollHeight;
      });

    const updateFilter = popover(page).getByRole("button", {
      name: "Update filter",
      exact: true,
    });
    await expect(updateFilter).toBeVisible();
    await updateFilter.click();
  });
});

test.describe("issue 14124", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not include date when metric is binned by hour of day (metabase#14124)", async ({
    mb,
    page,
  }) => {
    // MUTATION NOTE: removing this PUT entirely leaves the test GREEN
    // (ORDERS.CREATED_AT really is `type/CreationTimestamp` by default, so the
    // mutation applied). The precondition this 2020-era issue was written
    // around no longer influences the rendering on this jar — the setup step is
    // inert, NOT the assertions: mutating the breakout to `"hour"` kills the
    // header assertion, and adding `limit: 2` kills the "3:00 AM" one. Kept
    // verbatim (faithfulness over cleverness).
    await mb.api.put(`/api/field/${ORDERS.CREATED_AT}`, {
      semantic_type: null,
    });

    const { id } = await createQuestion(mb.api, {
      name: "14124",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
        ],
      },
    });
    await visitQuestion(page, id);

    // findAllBy* + should("be.visible") is an ANY-of-set assertion (rule 3).
    await expect(
      page
        .getByRole("columnheader", {
          name: "Created At: Hour of day",
          exact: true,
        })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();

    // Reported failing in v0.37.2
    await expect(
      page
        .getByRole("gridcell", { name: "3:00 AM", exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
  });
});

const MONGO_DB_ID = 2;

test.describe("issue 47793", { tag: ["@external", "@mongo"] }, () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, MONGO_SKIP_REASON);

  const questionDetails = {
    database: MONGO_DB_ID,
    native: {
      query: `[
  { $match: { quantity: {{quantity}} }},
  {
    "$project": {
      "_id": "$_id",
      "id": "$id",
      "user_id": "$user_id",
      "product_id": "$product_id",
      "subtotal": "$subtotal",
      "tax": "$tax",
      "total": "$total",
      "created_at": "$created_at",
      "quantity": "$quantity",
      "discount": "$discount"
    }
  },
  {
    "$limit": 1048575
  }
]`,
      "template-tags": {
        quantity: {
          type: "number",
          name: "quantity",
          id: "754ae827-661c-4fc9-b511-c0fb7b6bae2b",
          "display-name": "Quantity",
          default: "10",
        },
      },
      collection: "orders",
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore("mongo-5");
    await mb.signInAsAdmin();
  });

  test("should be able to preview queries for mongodb (metabase#47793)", async ({
    mb,
    page,
  }) => {
    const { id } = await createNativeQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    await page
      .getByTestId("visibility-toggler")
      .getByText(/open editor/i)
      .click();
    await page
      .getByTestId("native-query-editor-container")
      .getByLabel("Preview the query", { exact: true })
      .click();
    await expect(modal(page)).toContainText("$project");
    await expect(modal(page)).toContainText("quantity: 10");
  });
});

test.describe("issue 49270", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("document title should not indicate that loading takes place when query has errored (metabase#49270)", async ({
    page,
  }) => {
    await openOrdersTable(page);
    await icon(page, "sum").click();

    // cy.intercept("POST", "/api/dataset", req => req.reply({ statusCode: 500, delay: 1000 }))
    await page.route(
      (url) => new URL(url.toString()).pathname === "/api/dataset",
      async (route) => {
        if (route.request().method() !== "POST") {
          await route.fallback();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.fulfill({ status: 500, body: "" });
      },
    );

    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page).toHaveTitle("Doing science... · Metabase");
    await expect(page).toHaveTitle("Question · Metabase");
  });
});

test.describe("issue 53404", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should show an error message when overwriting a card with a cycle (metabase#53404)", async ({
    page,
  }) => {
    await visitQuestion(page, ORDERS_QUESTION_ID);
    await openNotebook(page);
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Join data", exact: true })
      .click();
    await miniPicker(page).getByText("Our analytics", { exact: true }).click();
    await miniPicker(page).getByText("Orders", { exact: true }).click();
    await popover(page).getByText("ID", { exact: true }).click();
    await popover(page).getByText("ID", { exact: true }).click();

    await queryBuilderHeader(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();
    const updateCard = waitForUpdateCard(page);
    await modal(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await updateCard;
    await expect(
      modal(page).getByText("Cannot save card with cycles.", { exact: true }),
    ).toBeVisible();
    await expect(modal(page).getByText(/undefined/)).toHaveCount(0);
  });
});

test.describe("issue 53170", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should correctly position the add column popover (metabase#53170)", async ({
    page,
  }) => {
    // { viewportWidth: 480, viewportHeight: 800 }
    await page.setViewportSize({ width: 480, height: 800 });

    await openOrdersTable(page);
    await page.getByLabel("Add column", { exact: true }).click();
    await popover(page).getByText("Combine columns", { exact: true }).click();

    const done = popover(page).getByRole("button", {
      name: "Done",
      exact: true,
    });
    const { buttonRight, innerWidth } = await done.evaluate(
      (el: HTMLElement) => ({
        buttonRight: el.getBoundingClientRect().right,
        innerWidth: window.innerWidth,
      }),
    );
    expect(innerWidth).toBeGreaterThan(buttonRight);
  });
});

test.describe("issue 54817", () => {
  const placeholder = "Find...";

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should allow to navigate to the search input in the filter picker via keyboard (metabase#54817)", async ({
    page,
  }) => {
    await openOrdersTable(page);
    await filterSimple(page);
    await expect(
      popover(page).getByPlaceholder(placeholder, { exact: true }),
    ).toBeFocused();
  });
});

test.describe("issue 57398", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should show the query running state when navigating back (metabase#57398)", async ({
    page,
  }) => {
    await openProductsTable(page);
    await filterSimple(page);

    // 1st filter
    await popover(page).getByText("Category", { exact: true }).click();
    await popover(page).getByText("Widget", { exact: true }).click();
    await popover(page)
      .getByLabel("Add another filter", { exact: true })
      .click();

    // 2st filter
    await popover(page).getByText("Vendor", { exact: true }).click();
    await popover(page)
      .getByText("Alfreda Konopelski II Group", { exact: true })
      .click();
    await popover(page)
      .getByLabel("Add another filter", { exact: true })
      .click();

    // delay the response to be able to verify the running state
    await page.route(
      (url) => new URL(url.toString()).pathname === "/api/dataset",
      async (route) => {
        if (route.request().method() !== "POST") {
          await route.fallback();
          return;
        }
        const response = await route.fetch();
        await new Promise((resolve) => setTimeout(resolve, 5000));
        await route.fulfill({ response });
      },
    );

    await page.goBack();
    await expect(
      queryBuilderMain(page).getByTestId("loading-indicator"),
    ).toBeVisible();
    const filtersPanel = page.getByTestId("qb-filters-panel");
    await expect(
      filtersPanel.getByText("Category is Widget", { exact: true }),
    ).toBeVisible();
    await expect(
      filtersPanel.getByText("Vendor is Alfreda Konopelski II Group", {
        exact: true,
      }),
    ).toHaveCount(0);

    // The 5s route delay is still in flight when the test ends; without this
    // Playwright reports a "route.fetch: Test ended" error that it attaches to
    // the NEXT test's context (observed on run 1). Harness hygiene only.
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
});

test.describe("issue 46845", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be able to run a query with multiple implicit joins for a native model (metabase#46845)", async ({
    mb,
    page,
  }) => {
    // create a native model with 2 FKs to the same table
    const { id } = await createNativeQuestion(mb.api, {
      name: "Model",
      type: "model",
      native: {
        query:
          "SELECT 1 AS PK, 5 AS FK1, 9 AS FK2 " +
          "UNION ALL " +
          "SELECT 2 AS PK, 4 AS FK1, 7 AS FK2",
      },
    });
    // H.createNativeQuestion(..., { visitQuestion: true }) routes `type:
    // "model"` through visitModel, not visitQuestion.
    await visitModel(page, id);

    // H.openQuestionActions("Edit metadata") is popover().findByText(exact),
    // which matches the row's own text node. Two things defeat a naive port:
    // the row renders a completion badge ("Edit metadata 33%"), and the icon's
    // aria-label is part of the accessible name ("label icon Edit metadata
    // 33%") — so neither an exact getByText nor an `^Edit metadata` anchored
    // name matches. The model page also renders this as a bare `role=menu`
    // that the shared `popover()` selector does not cover, so match page-wide
    // on the menuitem role.
    await icon(page.getByTestId("qb-header-action-panel"), "ellipsis").click();
    await page.getByRole("menuitem", { name: /Edit metadata/ }).click();

    await openColumnOptions(page, "PK");
    await mapColumnTo(page, { table: "Orders", column: "ID" });
    await renameColumn(page, "ID", "PK");

    await openColumnOptions(page, "FK1");
    await mapColumnTo(page, { table: "Orders", column: "Product ID" });
    await renameColumn(page, "Product ID", "First Product ID");

    await openColumnOptions(page, "FK2");
    await mapColumnTo(page, { table: "Orders", column: "Product ID" });
    await renameColumn(page, "Product ID", "Second Product ID");
    await saveMetadataChanges(page);

    // verify filtering on 2 different implicit column groups
    await openNotebook(page);
    await filterNotebook(page);
    await popover(page).getByText("First Product", { exact: true }).click();
    await popover(page).getByText("Category", { exact: true }).click();
    await popover(page).getByText("Gadget", { exact: true }).click();
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await icon(getNotebookStep(page, "filter"), "add").click();
    await popover(page).getByText("Second Product", { exact: true }).click();
    await popover(page).getByText("Category", { exact: true }).click();
    await popover(page).getByText("Widget", { exact: true }).click();
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await visualize(page);
    await assertQueryBuilderRowCount(page, 1);
  });
});

test.describe("54205", { tag: "@external" }, () => {
  // Untagged upstream, but the beforeEach restores `postgres-writable` and
  // DDLs against the writable QA Postgres — it cannot run without it.
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();

    // FINDINGS #85: `writable_db` is shared across all five slots. These
    // statements only touch this spec's OWN `public.products` and never a
    // foreign schema.
    await queryWritableDB("DROP TABLE IF EXISTS products", "postgres");
    await queryWritableDB(
      "CREATE TABLE IF NOT EXISTS products (id INT PRIMARY KEY, category VARCHAR, name VARCHAR)",
      "postgres",
    );
    await queryWritableDB(
      "INSERT INTO products (id, category, name) VALUES (1, 'A', 'Foo, Bar'), (2, 'B', 'Foo, Baz')",
      "postgres",
    );
    // Pass `tables` — the bare `{ dbId }` form gates on nothing (PORTING).
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: ["products"],
    });
  });

  test("should be able to select a comma separated value", async ({
    mb,
    page,
  }) => {
    // Schema pinned (FINDINGS #85): the shared container carries debris
    // schemas, and an unpinned lookup can win a foreign same-named table.
    // Polled: the snapshot's stale `products` row satisfies the resync gate
    // instantly — see getSyncedFieldId.
    const { tableId, fieldId } = await getSyncedFieldId(mb.api, {
      resolveTableId: () =>
        getTableId(mb.api, {
          databaseId: WRITABLE_DB_ID,
          name: "products",
          schema: "public",
        }),
      name: "name",
    });
    await mb.api.put(`/api/field/${fieldId}`, { has_field_values: "search" });

    const query = await createTestQuery(mb.api, {
      database: WRITABLE_DB_ID,
      stages: [{ source: { type: "table", id: tableId } }],
    });
    const card = await createCard(mb.api, {
      name: "Q 54205",
      dataset_query: query,
    });
    await visitQuestion(page, card.id);

    // cy.contains("Name") — case-sensitive substring, first DOM hit.
    await page
      .getByTestId("query-visualization-root")
      .getByText(/Name/)
      .first()
      .click();

    const scope = popover(page);
    await scope.getByText("Filter by this column", { exact: true }).click();
    const search = scope.getByPlaceholder("Search by Name", { exact: true });
    await search.click();
    await search.pressSequentially("Foo");
    // `exact` dropped: Mantine option rows carry more than the label in their
    // accessible name (PORTING).
    await scope.getByRole("option", { name: "Foo, Bar" }).click();
    await expect(scope.getByRole("list")).toHaveText("Foo, Bar");
  });
});

test.describe("issue 55631", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await startNewQuestion(page);
    await miniPicker(page)
      .getByText("Sample Database", { exact: true })
      .click();
    await miniPicker(page).getByText("Orders", { exact: true }).click();
  });

  test("should not flash the default title when saving the question (metabase#55631)", async ({
    page,
  }) => {
    await visualize(page);
    await page
      .getByTestId("qb-header")
      .getByRole("button", { name: "Save", exact: true })
      .click();

    await clearAndType(
      modal(page).getByLabel("Name", { exact: true }),
      "Custom",
    );
    await modal(page)
      .getByLabel("Where do you want to save this?", { exact: true })
      .click();

    await pickEntity(page, {
      path: ["Our analytics", "First collection"],
      select: true,
    });

    // Upstream samples the DOM once, immediately after `cy.wait("@cardCreate")`,
    // with `{ timeout: 10 }` — "It is important to have extremely short timeout
    // in order to catch the issue before the dialog closes."
    //
    // That shape does not survive the port. Cypress queries the DOM in-process,
    // synchronously, in the same event loop as the app. Playwright's sample is
    // an out-of-process round trip that lands *after* `waitForResponse`
    // resolves, and by then the modal has already unmounted — measured: the
    // modal contained ZERO controls on 5/5 runs. The absence check was passing
    // for the one reason that makes it worthless, and the intermittent
    // `inputValue` timeouts were the same race landing on the other side (the
    // old imperative `count()` + `nth(i).inputValue()` scan could see the modal
    // on the count and then hang on a node that had since been removed).
    //
    // So the sample is replaced with continuous observation, which is what the
    // test name actually claims: a *flash* is the title momentarily reverting
    // to "Orders" while the dialog is still up. A 4ms page-side poll installed
    // just before Save (the name field reads "Custom" at that point) catches it
    // regardless of where the modal's unmount lands relative to the response.
    // No timeout was raised and nothing was loosened — the assertion got
    // strictly harder to pass.
    await page.evaluate(() => {
      const MODAL = "[role='dialog'][aria-modal='true']";
      const state = { sawDefaultTitle: false, samplesWithModalOpen: 0 };
      (window as unknown as Record<string, unknown>).__flash55631 = state;

      const sample = () => {
        const dialogs = document.querySelectorAll(MODAL);
        if (dialogs.length === 0) {
          return;
        }
        state.samplesWithModalOpen += 1;
        dialogs.forEach((dialog) => {
          dialog
            .querySelectorAll("input, textarea, select")
            .forEach((control) => {
              if ((control as HTMLInputElement).value === "Orders") {
                state.sawDefaultTitle = true;
              }
            });
        });
      };

      sample();
      (window as unknown as Record<string, unknown>).__flash55631Timer =
        window.setInterval(sample, 4);
    });

    const cardCreate = waitForCreateCard(page);
    await modal(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await cardCreate;
    await expect(modal(page)).toHaveCount(0);

    const flash = await page.evaluate(() => {
      const win = window as unknown as Record<string, unknown>;
      window.clearInterval(win.__flash55631Timer as number);
      return win.__flash55631 as {
        sawDefaultTitle: boolean;
        samplesWithModalOpen: number;
      };
    });

    // Guard, not a product assertion: proves the observation window was real,
    // i.e. the poll ran while the dialog was still mounted. Without this the
    // absence check below could silently go vacuous again.
    expect(flash.samplesWithModalOpen).toBeGreaterThan(0);
    expect(flash.sawDefaultTitle).toBe(false);
  });
});

test.describe("issue 42723", () => {
  const questionDetails = {
    display: "line",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", PRODUCTS.CREATED_AT, { "base-type": "type/DateTime" }],
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
      ],
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be able to change the query without loosing the viz type (metabase#42723)", async ({
    mb,
    page,
  }) => {
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    await queryBuilderFooter(page)
      .getByLabel("Switch to data", { exact: true })
      .click({ force: true });
    await tableHeaderClick(page, "Count");
    await icon(popover(page), "arrow_up").click();
    await expect(
      icon(page.getByTestId("table-header"), "chevronup")
        .filter({ visible: true })
        .first(),
    ).toBeVisible();

    await queryBuilderFooter(page)
      .getByLabel("Switch to visualization", { exact: true })
      .click({ force: true });
    await ensureChartIsActive(page);
  });
});

test.describe("issue 58628", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signIn("nodata");
  });

  test("should show the unauthorized page when accessing the notebook editor without data perms (metabase#58628)", async ({
    page,
  }) => {
    // should not be able to access the notebook editor
    await page.goto("/question/notebook");
    await expect.poll(() => page.url()).toContain("/unauthorized");
    await expect(
      main(page).getByText("Sorry, you don’t have permission to see that.", {
        exact: true,
      }),
    ).toBeVisible();

    // should be able to access the query builder in view mode
    await visitQuestion(page, ORDERS_QUESTION_ID);
    await expect(queryBuilderHeader(page)).toBeVisible();
  });
});

test.describe("issue 52872", () => {
  const LONG_NAME = "a".repeat(254);

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    const { id } = await createQuestion(mb.api, {
      name: LONG_NAME,
      query: {
        "source-table": ORDERS_ID,
      },
    });
    await visitQuestion(page, id);
  });

  test("Saved questions with a very long title should wrap (metabse#52872)", async ({
    page,
  }) => {
    // Scoped to the QB header rather than page-wide (PORTING: a page-wide
    // display-value scan resolves a stale nth()). The title is an
    // EditableText <textarea>, which the scan covers.
    const title = await findByDisplayValue(queryBuilderHeader(page), LONG_NAME);
    await expect(title).toBeVisible();
    const { offsetWidth, innerWidth } = await title.evaluate(
      (el: HTMLElement) => ({
        offsetWidth: el.offsetWidth,
        innerWidth: window.innerWidth,
      }),
    );
    expect(offsetWidth).toBeLessThan(innerWidth);
  });
});

test.describe("issue 64293", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be possible to run a query for a empty required parameter without a default value (metabase#64293)", async ({
    mb,
    page,
  }) => {
    const questionDetails = {
      name: "Question 1",
      native: {
        query: "SELECT * FROM PEOPLE WHERE state = {{State}}",
        "template-tags": {
          State: {
            type: "text",
            name: "State",
            id: "1",
            "display-name": "State",
          },
        },
      },
      parameters: [
        createMockParameter({
          id: "1",
          slug: "State",
          required: true,
          name: "State",
        }),
      ],
    };

    const { id } = await createNativeQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    const stateInput = page.getByPlaceholder("State", { exact: true });
    await expect(stateInput).toBeAttached();
    // cy.type() clicks its subject first (PORTING).
    await stateInput.click();
    await page.keyboard.type("NY");
    await page.keyboard.press("Enter");

    await expect(runButtonOverlay(page)).toBeAttached();
    await runButtonOverlay(page).click();

    await ensureParameterColumnValue(page, {
      columnName: "STATE",
      columnValue: "NY",
    });
  });
});

test.describe("issue 13347", { tag: "@external" }, () => {
  // Untagged upstream, but the beforeEach restores `postgres-12` and creates
  // cards on database 2 (the QA Postgres).
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();

    await createQuestion(mb.api, {
      name: "13347 structured",
      database: WRITABLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
      },
    });

    await createNativeQuestion(mb.api, {
      name: "13347 native",
      database: WRITABLE_DB_ID,
      native: {
        query: "SELECT * FROM ORDERS",
      },
    });

    // The normal user belongs to the data group, which would otherwise get
    // query-builder access to this database by default. Revoke create-queries
    // so the user cannot build new questions on it - the condition this issue
    // is about. (Avoid view-data "blocked", which needs the
    // advanced-permissions token feature this spec doesn't have.)
    await updatePermissionsGraph(mb.api, {
      [DATA_GROUP]: {
        [WRITABLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "no",
        },
      },
    });

    await mb.signInAsNormalUser();

    await page.goto("/");
  });

  test("should not display questions in mini data picker that cannot be used for new questions (metabase#13347)", async ({
    page,
  }) => {
    await startNewQuestion(page);
    await miniPickerOurAnalytics(page).click();

    const picker = miniPicker(page);
    await expect(picker.getByText("Orders", { exact: true })).toBeAttached();

    await expect(
      picker.getByText("13347 structured", { exact: true }),
    ).toHaveCount(0);
    await expect(picker.getByText("13347 native", { exact: true })).toHaveCount(
      0,
    );
  });

  test("should not display questions in big data picker that cannot be used for new questions (metabase#13347)", async ({
    page,
  }) => {
    await startNewQuestion(page);
    await miniPickerBrowseAll(page).click();

    await entityPickerModalItem(page, 1, "Sample Database").click();

    const level = entityPickerModalLevel(page, 2);
    // The Cypress `.within()` on a findByTestId carries an implicit existence
    // requirement — port it as its own assertion so the absence checks below
    // can't pass on an unrendered list.
    await expect(level).toBeVisible();
    await expect(level.getByText("Orders", { exact: true })).toBeAttached();

    // ⚠️ MUTATION NOTE — the two absence assertions below are VACUOUS, and
    // vacuous UPSTREAM too (identical DOM, identical semantics, so this is not
    // port drift). Granting `create-queries: "query-builder"` — the exact
    // inversion that kills the sibling mini-picker test — leaves this one
    // green. Probed for PRESENCE under that same mutation, per PORTING's
    // "vacuous, or bad mutation?" method: level 2 under "Sample Database"
    // contains exactly ["Orders", "People", "Products", "Reviews"], and
    // `entity-picker-modal` matches /13347/ **zero** times anywhere. Saved
    // questions are never listed under a database node, and these two live on
    // database 2 (the QA Postgres) while the test drills into Sample Database
    // — so the locator can never match and no permission change can make it.
    // Ported verbatim with the analysis inline rather than "fixed".

    await expect(
      level.getByText("13347 structured", { exact: true }),
    ).toHaveCount(0);
    await expect(level.getByText("13347 native", { exact: true })).toHaveCount(
      0,
    );
  });
});

test.describe("issue #47005", { tag: "@external" }, () => {
  // The `postgres-12` restore is never used by this describe (everything runs
  // on the sample database) — kept for fidelity, but this is the clearest
  // "audit the snapshot dependency" candidate in the file.
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.restore("postgres-12");
    await mb.signInAsNormalUser();

    const question = await createQuestion(mb.api, {
      name: "Question A",
      query: {
        "source-table": ORDERS_ID,
      },
    });
    const { id } = await createQuestion(mb.api, {
      name: "Question B",
      query: {
        "source-table": "card__" + question.id,
      },
    });
    await visitQuestion(page, id);
  });

  test("should show the collection of the base question in breadcrumbs (metabase#47005)", async ({
    page,
  }) => {
    // jQuery `:contains()` is a CASE-SENSITIVE substring — hasText with a
    // string would be case-insensitive, so use a regex.
    await expect(
      page
        .getByTestId("head-crumbs-container")
        .filter({ hasText: /Question A/ })
        .getByText("Our analytics", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 66210", () => {
  const METRIC_NAME = "66210 metric";

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await createQuestion(mb.api, {
      name: METRIC_NAME,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
      type: "metric",
    });

    await page.goto("/");
  });

  test("should not allow you to join on metrics", async ({ page }) => {
    await startNewQuestion(page);
    await miniPickerBrowseAll(page).click();
    await entityPickerModalItem(page, 0, "Our analytics").click();
    await expect(entityPickerModalItem(page, 1, METRIC_NAME)).toBeVisible();
    await entityPickerModalItem(page, 1, "Orders").click();
    await join(page);
    await miniPickerBrowseAll(page).click();
    await entityPickerModalItem(page, 0, "Our analytics").click();

    const level = entityPickerModalLevel(page, 1);
    // Implicit existence of the level container (see 13347 above).
    await expect(level).toBeVisible();
    await expect(level.getByText(METRIC_NAME, { exact: true })).toHaveCount(0);
  });
});

test.describe("issue #67903", () => {
  test.beforeEach(async ({ mb, page }) => {
    await page.setViewportSize({ width: 630, height: 800 });
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not show preview table headers on top of other elements (metabase#67903)", async ({
    page,
  }) => {
    await startNewQuestion(page);
    await miniPickerBrowseAll(page).click();
    await pickEntity(page, {
      path: ["Databases", /Sample Database/, "Orders"],
      leaf: true,
    });
    await getNotebookStep(page, "data")
      .getByTestId("step-preview-button")
      .click();
    await queryBuilderHeader(page)
      .getByLabel("View SQL", { exact: true })
      .click();
    await expectCypressHidden(page.getByTestId("table-header"));
  });
});

test.describe("issue #67767", () => {
  const SCREEN_WIDTH = 630;

  test.beforeEach(async ({ mb, page }) => {
    await page.setViewportSize({ width: SCREEN_WIDTH, height: 800 });
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("only show preview query at full width on small screens (metabase#67767)", async ({
    page,
  }) => {
    await startNewQuestion(page);
    await miniPickerBrowseAll(page).click();
    await pickEntity(page, {
      path: ["Databases", /Sample Database/, "Orders"],
      leaf: true,
    });
    await getNotebookStep(page, "data")
      .getByTestId("step-preview-button")
      .click();
    await queryBuilderHeader(page)
      .getByLabel("View SQL", { exact: true })
      .click();

    const scrollWidth = await mainAside(page)
      .getByText("SQL for this question", { exact: true })
      .evaluate((el: HTMLElement) => el.scrollWidth);
    expect(scrollWidth).toBe(SCREEN_WIDTH);
  });
});

test.describe("issue 68574", () => {
  let questionId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const questionDetails = {
      name: "Question 1",
      native: {
        query: "SELECT * FROM ORDERS WHERE CREATED_AT > {{ start }}",
        "template-tags": {
          start: {
            type: "date",
            name: "start",
            "display-name": "Start",
            id: "1",
          },
        },
      },
      parameters: [
        createMockParameter({
          id: "1",
          slug: "start",
          required: true,
          name: "Start",
          type: "date/single",
          target: ["variable", ["template-tag", "start"]],
        }),
      ],
    };

    const card = await createNativeQuestion(mb.api, questionDetails);
    questionId = card.id;
  });

  test("should be possible to run a query for a empty required parameter without a default value (metabase#68574)", async ({
    mb,
    page,
  }) => {
    // `updateFormattingSettings(undefined)` upstream sends
    // `{ "type/Temporal": undefined }`, which JSON.stringify drops to `{}` —
    // the same thing happens here.
    const updateFormattingSettings = (settings: unknown) =>
      updateSetting(mb.api, "custom-formatting", { "type/Temporal": settings });

    const visitWithParam = (value: string) =>
      page.goto(`/question/${questionId}?start=${value}`);

    const assertParameterFormat = async (value: string) => {
      const target = page.getByTestId("parameter-value-widget-target");
      await expect(target).toBeVisible();
      await expect(target).toContainText(value);
    };

    await updateFormattingSettings({
      date_style: "D MMMM, YYYY",
      date_abbreviate: false,
    });
    await visitWithParam("2027-01-01");
    await assertParameterFormat("1 January, 2027");

    // change the date format
    await updateFormattingSettings({
      date_style: "dddd, MMMM D, YYYY",
      date_abbreviate: false,
    });
    await visitWithParam("2027-01-01");
    await assertParameterFormat("Friday, January 1, 2027");

    // enable date abbreviation
    await updateFormattingSettings({
      date_style: "dddd, MMMM D, YYYY",
      date_abbreviate: true,
    });
    await visitWithParam("2027-01-01");
    await assertParameterFormat("Fri, Jan 1, 2027");

    // even when the setting is unset, it should render a valid format
    await updateFormattingSettings(undefined);
    await visitWithParam("2027-01-01");
    await assertParameterFormat("January 1, 2027");
  });
});

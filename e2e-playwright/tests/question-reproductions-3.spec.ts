/**
 * Playwright port of
 * e2e/test/scenarios/question-reproductions/reproductions-3.cy.spec.js
 *
 * 28 independent question-builder regression guards. The repetition IS the
 * coverage — nothing here is merged or consolidated.
 *
 * Porting notes:
 * - `cy.intercept(...).as(x)` + `cy.wait("@x")` → `waitForResponse` registered
 *   BEFORE the triggering action (PORTING rule 2). The spec's `@cardQuery`
 *   alias comes from `H.visitQuestion`, so it is re-registered explicitly here.
 * - `cy.button(name)` → `getByRole("button", { name, exact: true })`;
 *   `cy.icon(name)` → `.Icon-<name>` (ui.ts `icon`).
 * - `findByText(string)` is an EXACT testing-library match → `{ exact: true }`.
 * - Infra gates (PORTING rule 6): `issue 38354` and `issue 40176` are
 *   `@external` (QA Postgres); `issue 42010` is `@mongo`. All three are gated on
 *   PW_QA_DB_ENABLED. Upstream CI excludes `@mongo` from its main leg, so the
 *   mongo describe is a distinct gating case and is tagged `@mongo` here too.
 * - `issue 10493` is tagged `@skip` upstream (never runs in CI) — ported in
 *   full and skipped with that reason rather than dropped.
 * - Spec-local helpers live in support/question-reproductions-3.ts.
 */
import { test, expect } from "../support/fixtures";
import { openOrdersTable, openProductsTable, openTable } from "../support/ad-hoc-question";
import { getDraggableElements, openVizTypeSidebar } from "../support/charts-extras";
import { echartsContainer, leftSidebar, openVizSettingsSidebar } from "../support/charts";
import { getDashboardCard } from "../support/dashboard";
import {
  createDashboardWithQuestions,
  createNativeQuestion,
  createQuestion,
} from "../support/factories";
import { queryBuilderFooter } from "../support/filter-bulk";
import { findByDisplayValue } from "../support/filters-repros";
import {
  addCustomColumn,
  filterNotebook,
  miniPickerBrowseAll,
} from "../support/joins";
import { cartesianChartCircles } from "../support/metrics";
import { summarize as summarizeSimple, tableInteractive } from "../support/models";
import { filter as filterSimple } from "../support/nested-questions";
import {
  assertQueryBuilderRowCount,
  enterCustomColumnDetails,
  entityPickerModal,
  getNotebookStep,
  miniPicker,
  openNotebook,
  startNewQuestion,
  tableHeaderClick,
  visualize,
} from "../support/notebook";
import { visitQuestionAdhoc } from "../support/permissions";
import { cachedUserName } from "../support/dashboard-core";
import { miniPickerHeader, tableInteractiveBody } from "../support/question-new";
import { rightSidebar } from "../support/question-saved";
import { questionInfoButton, sidesheet } from "../support/revisions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { WRITABLE_DB_ID, getTableId, resyncDatabase } from "../support/schema-viewer";
import {
  appBar,
  icon,
  modal,
  newButton,
  popover,
  queryBuilderHeader,
  visitDashboard,
  visitQuestion,
} from "../support/ui";
import { assertEChartsTooltip } from "../support/viz-charts-repros";
import {
  MONGO_SKIP_REASON,
  QA_DB_SKIP_REASON,
  assertPlanFieldValues,
  currentUserPersonalCollectionId,
  moveColumnDown,
  removeFilter,
  resetUuidPkTable,
  saveQuestionWithDefaults,
  searchMiniPickerAndSelect,
  setCurrentUserLocale,
  visualizeEitherEndpoint,
  waitForCardPivotQuery,
  waitForCardQuery,
  waitForDataset,
  waitForUpdateCard,
} from "../support/question-reproductions-3";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID, INVOICES_ID } =
  SAMPLE_DATABASE;

/** The dnd circle selector from e2e-visual-tests-helpers.js (H.cartesianChartCircle). */
const CARTESIAN_CIRCLE_PATH = "M1 0A1 1 0 1 1 1 -0.0001";

test.describe("issue 32964", () => {
  const LONG_NAME = "A very long column name that will cause text overflow";

  const QUESTION = {
    dataset_query: {
      type: "query" as const,
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          [LONG_NAME]: ["*", ["field", ORDERS.SUBTOTAL, null], 2],
        },
        aggregation: [["sum", ["expression", LONG_NAME]]],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            { "base-type": "type/DateTime", "temporal-unit": "week" },
          ],
        ],
      },
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not overflow chart settings sidebar with long column name (metabase#32964)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, QUESTION);
    await openVizSettingsSidebar(page);

    const sidebar = page.getByTestId("sidebar-left");
    await expect(sidebar).toBeVisible();
    const input = await findByDisplayValue(sidebar, `Sum of ${LONG_NAME}`);
    await expect(input).toBeVisible();

    const sidebarBox = await sidebar.boundingBox();
    const inputBox = await input.boundingBox();
    expect(sidebarBox).not.toBeNull();
    expect(inputBox).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(inputBox!.x + inputBox!.width).toBeLessThan(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      sidebarBox!.x + sidebarBox!.width,
    );
  });
});

test.describe("issue 33079", () => {
  const questionDetails = {
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await setCurrentUserLocale(mb.api, "de");
  });

  test("underlying records drill should work in a non-English locale (metabase#33079)", async ({
    mb,
    page,
  }) => {
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    await cartesianChartCircles(page).nth(1).click();

    const dataset = waitForDataset(page);
    await popover(page)
      .getByText("Siehe diese Einträge", { exact: true }) // See these records
      .click();
    await dataset;

    await expect(page.getByTestId("question-row-count")).toContainText("19");
  });
});

test.describe("issue 34414", () => {
  const INVOICE_MODEL_DETAILS = {
    name: "Invoices Model",
    query: { "source-table": INVOICES_ID },
    type: "model" as const,
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("populate field values after re-adding filter on virtual table field (metabase#34414)", async ({
    mb,
    page,
  }) => {
    const { id: modelId } = await createQuestion(mb.api, INVOICE_MODEL_DETAILS);

    await visitQuestionAdhoc(page, {
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": `card__${modelId}` },
      },
    });

    await openNotebook(page);
    await filterNotebook(page);

    const scope = popover(page);
    await scope.getByText("Plan", { exact: true }).click();
    await assertPlanFieldValues(scope);

    // Open filter again
    await scope.getByLabel("Back", { exact: true }).click();

    // Open plan field again
    await scope.getByText("Plan", { exact: true }).click();

    await assertPlanFieldValues(scope);
  });
});

test.describe("issue 38176", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("restoring a question to a previous version should preserve the variables (metabase#38176)", async ({
    mb,
    page,
  }) => {
    const { id } = await createNativeQuestion(mb.api, {
      name: "38176",
      native: {
        query:
          'SELECT "COUNTRY" from "ACCOUNTS" WHERE country = {{ country }} LIMIT 5',
        "template-tags": {
          country: {
            type: "text",
            id: "dd06cd10-596b-41d0-9d6e-94e98ceaf989",
            name: "country",
            "display-name": "Country",
          },
        },
      },
    });
    await visitQuestion(page, id);

    await page.getByPlaceholder("Country", { exact: true }).fill("NL");

    // Upstream's `cy.wait("@cardQuery")` after the description edit is
    // RETROACTIVE: the alias is registered by H.visitQuestion and the only
    // unconsumed response at that point is the run this play click fires (the
    // description PUT re-runs nothing). Register the wait at the true trigger.
    const cardQuery1 = waitForCardQuery(page);
    await icon(queryBuilderHeader(page), "play").click();

    await questionInfoButton(page).click();

    const sheet = sidesheet(page);
    // EditableText: fill() doesn't mark it dirty — click, type, blur.
    const description = sheet.getByPlaceholder("Add description", {
      exact: true,
    });
    await description.click();
    await description.pressSequentially("This is a question");

    const updateQuestion = waitForUpdateCard(page);
    await description.blur();
    await updateQuestion;
    await cardQuery1;

    await sheet.getByRole("tab", { name: "History", exact: true }).click();
    await expect(sheet.getByText(/added a description/i)).toBeVisible();

    const cardQuery2 = waitForCardQuery(page);
    await sheet.getByTestId("question-revert-button").click();
    await cardQuery2;

    await sheet.getByRole("tab", { name: "History", exact: true }).click();
    await expect(
      sheet.getByText(/reverted to an earlier version/i),
    ).toBeVisible({ timeout: 10000 });

    await page.getByLabel("Close", { exact: true }).click();
    await expect(tableInteractive(page)).toContainText("NL");
  });
});

test.describe("issue 38354", { tag: "@external" }, () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  const QUESTION_DETAILS = {
    query: {
      "source-table": ORDERS_ID,
      limit: 5,
    },
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();
    const { id } = await createQuestion(mb.api, QUESTION_DETAILS);
    await visitQuestion(page, id);
  });

  test("should be possible to change source database (metabase#38354)", async ({
    page,
  }) => {
    await openNotebook(page);
    await getNotebookStep(page, "data").getByTestId("data-step-cell").click();

    const picker = miniPicker(page);
    await miniPickerHeader(page).click();
    await picker.getByText("QA Postgres12", { exact: true }).click();
    await picker.getByText("Orders", { exact: true }).click();

    // optimization: add a limit so that query runs faster
    await page.getByRole("button", { name: "Row limit", exact: true }).click();
    await getNotebookStep(page, "limit")
      .getByPlaceholder("Enter a limit", { exact: true })
      .fill("5");

    await visualize(page);

    await expect(
      page
        .getByTestId("query-builder-main")
        .getByText("There was a problem with your question", { exact: true }),
    ).toHaveCount(0);
    // assert visualization renders the data
    await expect(
      page.getByTestId("cell-data").filter({ hasText: "37.65" }).first(),
    ).toBeVisible();
  });
});

test.describe("issue 30056", () => {
  const questionDetails = {
    query: {
      "source-query": {
        "source-table": PEOPLE_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", PEOPLE.LATITUDE, { "base-type": "type/Float" }],
          ["field", PEOPLE.LONGITUDE, { "base-type": "type/Float" }],
        ],
      },
      filter: [">", ["field", "count", { "base-type": "type/Integer" }], 2],
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should show table breadcrumbs for questions with post-aggregation filters (metabase#30056)", async ({
    mb,
    page,
  }) => {
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    // the name of the table is hidden after a few seconds with a CSS animation,
    // so check for "exist" only
    await expect(
      queryBuilderHeader(page).getByText("People", { exact: true }),
    ).toBeAttached();
  });
});

test.describe("issue 39102", () => {
  const questionDetails = {
    name: "39102",
    query: {
      "source-query": {
        "source-table": ORDERS_ID,
        aggregation: ["count"],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      filter: [">", ["field", "count", { "base-type": "type/Integer" }], 1000],
      aggregation: ["count"],
    },
    type: "question" as const,
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should be able to preview a multi-stage query (metabase#39102)", async ({
    mb,
    page,
  }) => {
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
    await openNotebook(page);

    const preview = page.getByTestId("preview-root");

    let dataset = waitForDataset(page);
    await icon(getNotebookStep(page, "data", { stage: 0 }), "play").click();
    await dataset;
    await expect(preview.getByText("Tax", { exact: true })).toBeVisible();
    await icon(preview, "close").click();

    dataset = waitForDataset(page);
    await icon(getNotebookStep(page, "summarize", { stage: 0 }), "play").click();
    await dataset;
    await expect(preview.getByText("Count", { exact: true })).toBeVisible();
    await expect(preview.getByText("3,610", { exact: true })).toBeVisible();
    await expect(preview.getByText("744", { exact: true })).toBeVisible();
    await icon(preview, "close").click();

    dataset = waitForDataset(page);
    await icon(getNotebookStep(page, "filter", { stage: 1 }), "play").click();
    await dataset;
    await expect(preview.getByText("Count", { exact: true })).toBeVisible();
    await expect(preview.getByText("3,610", { exact: true })).toBeVisible();
    await expect(preview.getByText("744", { exact: true })).toHaveCount(0);
    await icon(preview, "close").click();

    dataset = waitForDataset(page);
    await icon(getNotebookStep(page, "summarize", { stage: 1 }), "play").click();
    await dataset;
    await expect(preview.getByText("Count", { exact: true })).toBeVisible();
    await expect(preview.getByText("4", { exact: true })).toBeVisible();
  });
});

test.describe("issue 13814", () => {
  const questionDetails = {
    display: "scalar",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["count", ["field", ORDERS.TAX, { "base-type": "type/Float" }]],
      ],
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should support specifying a field in 'count' MBQL clause even if the UI doesn't support it (metabase#13814)", async ({
    mb,
    page,
  }) => {
    // verify that the API supports saving this MBQL
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    // verify that the query is executed correctly
    await expect(
      page.getByTestId("scalar-value").getByText("18,760", { exact: true }),
    ).toBeVisible();

    // verify that the clause is displayed correctly and won't crash if updated
    await openNotebook(page);
    const summarizeStep = getNotebookStep(page, "summarize");
    const countOfTax = summarizeStep.getByText("Count of Tax", { exact: true });
    await expect(countOfTax).toBeVisible();
    await countOfTax.click();
    await popover(page).getByText("Count of rows", { exact: true }).click();
    await expect(
      summarizeStep.getByText("Count", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 39795", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // If you comment out this post, then the test will pass.
    await mb.api.post(`/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      human_readable_field_id: PRODUCTS.TITLE,
      name: "Product ID",
      type: "external",
    });
  });

  test("should allow me to re-order even when a field is set with a different display value (metabase#39795)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
        },
        type: "query",
      },
    });
    await openVizSettingsSidebar(page);
    await expect(getDraggableElements(page).first()).toBeVisible();
    await moveColumnDown(getDraggableElements(page).first(), 2);

    // We are not able to re-order because the dataset will also contain values a
    // column for Product ID. This causes the isValid() check to fire, and you are
    // always forced into the default value for table.columns
    await expect(getDraggableElements(page).nth(2)).toContainText("ID");
  });
});

test.describe("issue 40176", { tag: "@external" }, () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  const TABLE = "uuid_pk_table";

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();
    await resetUuidPkTable();
    // PORTING: resyncDatabase without `tables` gates on NOTHING — pass the
    // table we just created.
    await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID, tables: [TABLE] });
  });

  test("should allow filtering on UUID PK columns (metabase#40176)", async ({
    mb,
    page,
  }) => {
    const tableId = await getTableId(mb.api, {
      databaseId: WRITABLE_DB_ID,
      name: TABLE,
    });
    await visitQuestionAdhoc(page, {
      display: "table",
      dataset_query: {
        database: WRITABLE_DB_ID,
        query: {
          "source-table": tableId,
        },
        type: "query",
      },
    });

    await openNotebook(page);
    await page
      .getByTestId("action-buttons")
      .getByText("Filter", { exact: true })
      .click();

    const scope = popover(page);
    await scope.getByText("ID", { exact: true }).click();
    const value = scope.getByLabel("Filter value", { exact: true });
    await value.click();
    await page.keyboard.type("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
    // A focused MultiAutocomplete/PillsInput swallows the submit click
    // (PORTING): blur before pressing the button.
    await value.blur();
    await scope.getByRole("button", { name: "Add filter", exact: true }).click();

    await visualize(page);
    await expect(
      page
        .getByTestId("question-row-count")
        .getByText("Showing 1 row", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 40435", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should make new query columns visible by default (metabase#40435)", async ({
    page,
  }) => {
    await openOrdersTable(page);
    await openNotebook(page);
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Pick columns", exact: true })
      .click();
    await popover(page).getByText("Select all", { exact: true }).click();
    await popover(page).getByText("User ID", { exact: true }).click();
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Pick columns", exact: true })
      .click();
    await visualize(page);
    await openVizSettingsSidebar(page);
    const sidebar = page.getByTestId("sidebar-left");
    await sidebar.getByTestId("ID-hide-button").click();
    await sidebar.getByTestId("ID-show-button").click();
    await saveQuestionWithDefaults(page);

    await openNotebook(page);
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Pick columns", exact: true })
      .click();
    await popover(page).getByText("Product ID", { exact: true }).click();
    await queryBuilderHeader(page)
      .getByText("Save", { exact: true })
      .click();
    const updateCard = waitForUpdateCard(page);
    await modal(page).last().getByText("Save", { exact: true }).click();
    await updateCard;
    // The question is saved by now, so the run goes through
    // POST /api/card/:id/query rather than /api/dataset.
    await visualizeEitherEndpoint(page);

    await expect(
      page.getByRole("columnheader", { name: "ID", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "User ID", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Product ID", exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 41381", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not show an error message when adding a constant-only custom expression (metabase#41381)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });
    await addCustomColumn(page);
    await enterCustomColumnDetails(page, {
      formula: "'Test'",
      name: "Constant",
    });
    const scope = popover(page);
    await expect(
      scope.getByText("Invalid expression", { exact: true }),
    ).toHaveCount(0);
    await expect(
      scope.getByRole("button", { name: "Done", exact: true }),
    ).toBeEnabled();
  });
});

test.describe(
  "issue 42010 -- Unable to filter by mongo id",
  { tag: "@mongo" },
  () => {
    test.skip(!process.env.PW_QA_DB_ENABLED, MONGO_SKIP_REASON);

    test.beforeEach(async ({ mb, page }) => {
      await mb.restore("mongo-5");
      await mb.signInAsAdmin();

      const schema = (await (
        await mb.api.get(`/api/database/${WRITABLE_DB_ID}/schema/`)
      ).json()) as { id: number; name: string }[];
      const tableId = schema.find((table) => table.name === "orders")?.id;
      if (tableId == null) {
        throw new Error("No `orders` table on the mongo QA database");
      }
      // openTable → visitQuestionAdhoc, which already awaits the @dataset
      // response the Cypress beforeEach waited on separately.
      await openTable(page, {
        database: WRITABLE_DB_ID,
        table: tableId,
        limit: 2,
      });
    });

    test("should be possible to filter by Mongo _id column (metabase#40770, metabase#42010)", async ({
      page,
    }) => {
      // Ids are non-deterministic so we have to obtain the id from the cell,
      // and store its value.
      const firstCell = tableInteractiveBody(page)
        .getByTestId("center-center-quadrant")
        .getByRole("gridcell")
        .first();
      await expect(firstCell).toBeVisible();
      const id = (await firstCell.textContent()) ?? "";

      // Scenario 1 - Make sure the simple mode filter is working correctly
      // (metabase#40770)
      await filterSimple(page);
      const filterPopover = popover(page);
      await expect(
        filterPopover.getByText("ID", { exact: true }),
      ).toHaveCount(2);
      await filterPopover.getByText("ID", { exact: true }).first().click();
      const simpleValue = filterPopover.getByLabel("Filter value", {
        exact: true,
      });
      await simpleValue.click();
      await page.keyboard.type(id);
      // PillsInput blur trap (PORTING) — blur before the submit click.
      await simpleValue.blur();
      await filterPopover
        .getByRole("button", { name: "Apply filter", exact: true })
        .click();
      await assertQueryBuilderRowCount(page, 1);
      await removeFilter(page);

      // Scenario 2 - Make sure filter is working in the notebook editor
      // (metabase#42010)
      await openNotebook(page);
      await filterNotebook(page);

      const firstOption = popover(page).getByRole("option").first();
      await expect(firstOption).toHaveText("ID");
      await firstOption.click();

      const stringPicker = page.getByTestId("string-filter-picker");
      await expect(
        stringPicker.getByLabel("Filter operator", { exact: true }),
      ).toHaveText("Is");
      const notebookValue = stringPicker.getByLabel("Filter value", {
        exact: true,
      });
      await notebookValue.click();
      await page.keyboard.type(id);
      await notebookValue.blur();
      await stringPicker
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      const filterStep = page.getByTestId("step-filter-0-0");
      await expect(
        filterStep.getByText(`ID is ${id}`, { exact: true }),
      ).toBeVisible();

      // Scenario 2.1 - Trigger the preview to make sure it reflects the filter
      // correctly
      const dataset = waitForDataset(page);
      await icon(filterStep, "play").click();
      await dataset;

      // The preview should show only one row
      const ordersColumns = 10;
      const previewCells = page
        .getByTestId("preview-root")
        .getByTestId("table-body")
        .getByTestId("cell-data");
      await expect(previewCells.first()).toBeVisible();
      expect(await previewCells.count()).toBeLessThanOrEqual(ordersColumns);

      // Scenario 2.2 - Make sure we can visualize the data
      await visualize(page);
      await expect(page.getByTestId("question-row-count")).toHaveText(
        "Showing 1 row",
      );
    });
  },
);

test.describe("issue 33439", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should show an error message when trying to use convertTimezone on an unsupported db (metabase#33439)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });
    await addCustomColumn(page);
    await enterCustomColumnDetails(page, {
      formula:
        'convertTimezone("2022-12-28T12:00:00", "Canada/Pacific", "Canada/Eastern")',
      name: "Date",
    });
    const scope = popover(page);
    await expect(
      scope.getByText("Unsupported function convertTimezone", { exact: true }),
    ).toBeVisible();
    await expect(
      scope.getByRole("button", { name: "Done", exact: true }),
    ).toBeDisabled();
  });
});

test.describe("issue 42244", () => {
  const COLUMN_NAME = "Created At".repeat(5);

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.put(`/api/field/${ORDERS.CREATED_AT}`, {
      display_name: COLUMN_NAME,
    });
  });

  test("should allow to change the temporal bucket when the column name is long (metabase#42244)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });
    await page.getByTestId("action-buttons").locator(".Icon-sum").click();
    await getNotebookStep(page, "summarize")
      .getByText("Pick a column to group by", { exact: true })
      .click();

    const scope = popover(page);
    await scope.getByText(COLUMN_NAME, { exact: true }).hover();
    const byMonth = scope.getByText("by month", { exact: true });
    await expect(byMonth).toBeVisible();
    await byMonth.click();

    await popover(page).last().getByText("Year", { exact: true }).click();
    await expect(
      getNotebookStep(page, "summarize").getByText(`${COLUMN_NAME}: Year`, {
        exact: true,
      }),
    ).toBeVisible();
  });
});

test.describe("issue 40064", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be able to edit a custom column with the same name as one of the columns used in the expression (metabase#40064)", async ({
    mb,
    page,
  }) => {
    const { id } = await createQuestion(mb.api, {
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          Tax: ["*", ["field", ORDERS.TAX, { "base-type": "type/Float" }], 2],
        },
        limit: 1,
      },
    });
    await visitQuestion(page, id);

    // check the initial expression value
    await expect(
      tableInteractive(page).getByText("4.14", { exact: true }),
    ).toBeVisible();

    // update the expression and check the value
    await openNotebook(page);
    await getNotebookStep(page, "expression")
      .getByText("Tax", { exact: true })
      .click();
    await enterCustomColumnDetails(page, { formula: "[Tax] * 3", blur: true });
    await popover(page)
      .getByRole("button", { name: "Update", exact: true })
      .click();
    await visualize(page);
    await expect(
      tableInteractive(page).getByText("6.21", { exact: true }),
    ).toBeVisible();

    // rename the expression and make sure you cannot create a cycle
    await openNotebook(page);
    await getNotebookStep(page, "expression")
      .getByText("Tax", { exact: true })
      .click();
    await enterCustomColumnDetails(page, {
      formula: "[Tax] * 3",
      name: "Tax3",
      blur: true,
    });
    const update = popover(page).getByRole("button", {
      name: "Update",
      exact: true,
    });
    await expect(update).toBeEnabled();
    await update.click();

    await getNotebookStep(page, "expression")
      .getByText("Tax3", { exact: true })
      .click();
    await enterCustomColumnDetails(page, {
      formula: "[Tax3] * 3",
      name: "Tax3",
      blur: true,
    });
    const scope = popover(page);
    await expect(
      scope.getByText("Unknown column: Tax3", { exact: true }),
    ).toBeVisible();
    await expect(
      scope.getByRole("button", { name: "Update", exact: true }),
    ).toBeDisabled();
  });
});

test.describe("issue 10493", () => {
  // Upstream tags this describe `@skip`, so it never runs in CI. Ported in full
  // rather than dropped, and skipped for the same reason.
  test.skip(true, "Skipped upstream (@skip tag)");

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not reset chart axes after adding a new query stage (metabase#10493)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      display: "bar",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              ORDERS.QUANTITY,
              { "base-type": "type/Integer", binning: { strategy: "default" } },
            ],
          ],
          "source-table": ORDERS_ID,
        },
      },
    });

    await filterSimple(page);
    const filterModal = modal(page);
    await filterModal.getByText("Summaries", { exact: true }).click();
    const countColumn = filterModal.getByTestId("filter-column-Count");
    await countColumn.getByPlaceholder("Min", { exact: true }).fill("0");
    await countColumn.getByPlaceholder("Max", { exact: true }).fill("30000");
    const dataset = waitForDataset(page);
    await filterModal
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await dataset;

    const chart = echartsContainer(page);
    // y axis
    await expect(chart.getByText("Count", { exact: true })).toBeAttached();
    await expect(chart.getByText("21,000", { exact: true })).toBeAttached();
    await expect(chart.getByText("3,000", { exact: true })).toBeAttached();

    // x axis
    await expect(chart.getByText("Quantity", { exact: true })).toBeAttached();
    await expect(chart.getByText("25", { exact: true })).toBeAttached();
    await expect(chart.getByText("75", { exact: true })).toBeAttached();
  });
});

test.describe("issue 44071", () => {
  const questionName = "Test";

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signIn(cachedUserName("nocollection"));
    const collectionId = await currentUserPersonalCollectionId(mb.api);
    await createQuestion(mb.api, {
      name: questionName,
      query: { "source-table": ORDERS_ID },
      collection_id: collectionId,
    });
  });

  test("should be able to save questions based on another questions without collection access (metabase#44071)", async ({
    page,
  }) => {
    await page.goto("/");
    await newButton(page).click();
    await popover(page).getByText("Question", { exact: true }).click();
    await miniPickerBrowseAll(page).click();
    await entityPickerModal(page)
      .getByText(/Personal Collection/)
      .click();
    await entityPickerModal(page)
      .getByText(questionName, { exact: true })
      .click();
    await expect(
      getNotebookStep(page, "data").getByText(questionName, { exact: true }),
    ).toBeVisible();
    await saveQuestionWithDefaults(page);
    await expect(appBar(page).getByText(/Personal Collection/)).toBeVisible();
  });
});


test.describe("issue 44415", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signIn("admin");
  });

  test("should be able to edit a table question in the notebook editor before running its query (metabase#44415)", async ({
    mb,
    page,
  }) => {
    const { id: questionId } = await createQuestion(mb.api, {
      query: {
        "source-table": ORDERS_ID,
        filter: [
          "and",
          ["not-null", ["field", ORDERS.DISCOUNT, { "base-type": "type/Float" }]],
        ],
      },
      visualization_settings: {
        "table.columns": [
          { name: "ID", fieldRef: ["field", ORDERS.ID, null], enabled: true },
          {
            name: "DISCOUNT",
            fieldRef: ["field", ORDERS.DISCOUNT, null],
            enabled: true,
          },
        ],
      },
    });

    await page.goto(`/question/${questionId}/notebook`);

    await icon(
      getNotebookStep(page, "filter")
        .getByTestId("notebook-cell-item")
        .first(),
      "close",
    ).click();

    await expect(getNotebookStep(page, "filter")).toHaveCount(0);

    await visualize(page);

    await expect(page.getByTestId("qb-filters-panel")).toHaveCount(0);
    await expect
      .poll(() => page.url())
      .not.toContain(`/question/${questionId}`);
    await expect.poll(() => page.url()).toContain("question#");
  });
});

test.describe("issue 37374", () => {
  const questionDetails = {
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
        ["field", PRODUCTS.VENDOR, { "base-type": "type/Text" }],
      ],
    },
  };

  test("should allow to change the viz type to pivot without data access (metabase#37374)", async ({
    mb,
    page,
  }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    const { id: questionId } = await createQuestion(mb.api, questionDetails);
    await mb.signIn("nodata");

    await visitQuestion(page, questionId);

    // changing the viz type to pivot table and running the query works
    await openVizTypeSidebar(page);
    const cardPivotQuery = waitForCardPivotQuery(page);
    await page
      .getByTestId("chart-type-sidebar")
      .getByTestId("Pivot Table-button")
      .click();
    await cardPivotQuery;
    await expect(page.getByTestId("pivot-table")).toBeVisible();

    // changing the viz type back to table and running the query works
    const cardQuery = waitForCardQuery(page);
    await page
      .getByTestId("chart-type-sidebar")
      .getByTestId("Table-button")
      .click();
    await cardQuery;
    await expect(tableInteractive(page)).toBeVisible();
  });
});

test.describe("issue 44532", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await openProductsTable(page);
  });

  test("should update chart metrics and dimensions with each added breakout (metabase #44532)", async ({
    page,
  }) => {
    await summarizeSimple(page);

    let dataset = waitForDataset(page);
    await rightSidebar(page)
      .getByRole("listitem", { name: "Category", exact: true })
      .getByRole("button", { name: "Add dimension", exact: true })
      .click();
    await dataset;

    const chart = echartsContainer(page);
    await expect(chart.getByText("Count", { exact: true })).toBeAttached(); // y-axis
    await expect(chart.getByText("Category", { exact: true })).toBeAttached(); // x-axis

    // x-axis values
    await expect(chart.getByText("Doohickey", { exact: true })).toBeAttached();
    await expect(chart.getByText("Gadget", { exact: true })).toBeAttached();
    await expect(chart.getByText("Gizmo", { exact: true })).toBeAttached();
    await expect(chart.getByText("Widget", { exact: true })).toBeAttached();

    dataset = waitForDataset(page);
    await rightSidebar(page)
      .getByRole("listitem", { name: "Created At", exact: true })
      .getByRole("button", { name: "Add dimension", exact: true })
      .click();
    await dataset;

    const assertLegendAndAxes = async () => {
      const legend = page.getByLabel("Legend", { exact: true });
      await expect(legend.getByText("Doohickey", { exact: true })).toBeAttached();
      await expect(legend.getByText("Gadget", { exact: true })).toBeAttached();
      await expect(legend.getByText("Gizmo", { exact: true })).toBeAttached();
      await expect(legend.getByText("Widget", { exact: true })).toBeAttached();

      const container = echartsContainer(page);
      await expect(
        container.getByText("Count", { exact: true }),
      ).toBeAttached(); // y-axis
      await expect(
        container.getByText("Created At: Month", { exact: true }),
      ).toBeAttached(); // x-axis

      // x-axis values
      await expect(
        container.getByText("January 2026", { exact: true }),
      ).toBeAttached();
      await expect(
        container.getByText("January 2027", { exact: true }),
      ).toBeAttached();
      await expect(
        container.getByText("January 2028", { exact: true }),
      ).toBeAttached();

      // previous x-axis values
      await expect(
        container.getByText("Doohickey", { exact: true }),
      ).toHaveCount(0);
      await expect(container.getByText("Gadget", { exact: true })).toHaveCount(0);
      await expect(container.getByText("Gizmo", { exact: true })).toHaveCount(0);
      await expect(container.getByText("Widget", { exact: true })).toHaveCount(0);
    };

    await assertLegendAndAxes();

    dataset = waitForDataset(page);
    await rightSidebar(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await dataset;

    await assertLegendAndAxes();
  });
});

test.describe("issue 33441", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should show an error message for an incorrect date expression (metabase#33441)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });
    await addCustomColumn(page);
    await enterCustomColumnDetails(page, {
      formula: 'datetimeDiff([Created At] , now(), "days")',
      name: "Date",
    });
    const scope = popover(page);
    await expect(
      scope.getByText("Types are incompatible.", { exact: true }),
    ).toBeVisible();
    await expect(
      scope.getByRole("button", { name: "Done", exact: true }),
    ).toBeDisabled();
  });
});

test.describe("issue 31960", () => {
  const questionDetails = {
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
    },
    display: "line",
    visualization_settings: {
      "graph.metrics": ["count"],
      "graph.dimensions": ["CREATED_AT"],
    },
  };

  // the dot that corresponds to July 10–16, 2025
  const dotIndex = 10;
  const rowCount = 11;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should apply a date range filter for a query broken out by week (metabase#31960)", async ({
    mb,
    page,
  }) => {
    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      questions: [questionDetails],
    });
    await visitDashboard(page, mb.api, dashboard.id);

    // H.cartesianChartCircle() scoped to the dashcard (the shared
    // cartesianChartCircles takes a Page); same circle path selector.
    const dot = getDashboardCard(page)
      .locator(`path[d="${CARTESIAN_CIRCLE_PATH}"]`)
      .nth(dotIndex);
    // The weekly series packs ~3px dots a few px apart inside a dashcard, so a
    // neighbouring circle path is topmost at the target's centre and Playwright's
    // hit-test refuses. cypress-real-events' realHover does no hit-testing.
    await dot.hover({ force: true });

    await assertEChartsTooltip(page, {
      // expect this to break when we shift years in the Sample Database
      header: "July 13–19, 2025",
      rows: [{ name: "Count", value: String(rowCount), secondaryValue: "0%" }],
    });

    await dot.click({ force: true });

    await popover(page).getByText("See these Orders", { exact: true }).click();
    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("Created At: Week is Jul 13–19, 2025", { exact: true }),
    ).toBeVisible();
    await assertQueryBuilderRowCount(page, rowCount);
  });
});

test.describe("issue 43294", () => {
  const questionDetails = {
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    visualization_settings: {
      "graph.metrics": ["count"],
      "graph.dimensions": ["CREATED_AT"],
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not overwrite viz settings with click actions in raw data mode (metabase#43294)", async ({
    mb,
    page,
  }) => {
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
    // Both QuestionDisplayToggle segments are `disabled: true` by design — the
    // SegmentedControl root carries the onClick — so Playwright's actionability
    // refuses the icon. PORTING: a SegmentedControl option survives force-click
    // because the intercepting label span is the click target's own child.
    await queryBuilderFooter(page)
      .getByLabel("Switch to data", { exact: true })
      .click({ force: true });

    // TODO: reenable this when we reenable the "Compare to the past" components.
    // (upstream keeps the compare-action block commented out)

    // extract action
    await page
      .getByRole("button", { name: "Add column", exact: true })
      .click();
    await popover(page)
      .getByText("Extract part of column", { exact: true })
      .click();
    await popover(page)
      .getByText("Created At: Month", { exact: true })
      .click();
    await popover(page).getByText("Year", { exact: true }).click();

    // combine action
    await page
      .getByRole("button", { name: "Add column", exact: true })
      .click();
    await popover(page).getByText("Combine columns", { exact: true }).click();
    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    // check visualization
    await queryBuilderFooter(page)
      .getByLabel("Switch to visualization", { exact: true })
      .click({ force: true });
    const chart = echartsContainer(page);
    await expect(chart.getByText("Count", { exact: true })).toBeVisible();
    await expect(
      chart.getByText("Created At: Month", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 40399", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not show results from other stages in a stages preview (metabase#40399)", async ({
    mb,
    page,
  }) => {
    const { id } = await createQuestion(mb.api, {
      name: "40399",
      query: {
        "source-table": PRODUCTS_ID,
        joins: [
          {
            fields: "all",
            alias: "Orders",
            "source-table": ORDERS_ID,
            strategy: "left-join",
            condition: [
              "=",
              ["field", PRODUCTS.ID, null],
              ["field", ORDERS.PRODUCT_ID, { "join-alias": "Orders" }],
            ],
          },
        ],
        filter: ["=", ["field", PRODUCTS.CATEGORY, null], "Widget"],
      },
    });
    await visitQuestion(page, id);

    await openNotebook(page);

    const filterStep = getNotebookStep(page, "filter", { stage: 0 });
    await icon(filterStep, "play").click();
    await expect(
      filterStep
        .getByTestId("preview-root")
        .getByText("Widget", { exact: true })
        .first(),
    ).toBeVisible();

    const joinStep = getNotebookStep(page, "join", { stage: 0 });
    await icon(joinStep, "play").click();
    await expect(
      joinStep
        .getByTestId("preview-root")
        .getByText("Gizmo", { exact: true })
        .first(),
    ).toBeVisible();
    await expect(
      joinStep.getByTestId("preview-root").getByText("Widget", { exact: true }),
    ).toHaveCount(0);

    const dataStep = getNotebookStep(page, "data", { stage: 0 });
    await icon(dataStep, "play").click();
    const dataPreview = dataStep.getByTestId("preview-root");
    await expect(
      dataPreview.getByText("Gizmo", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      dataPreview.getByText("Gizmo", { exact: true }).first(),
    ).toBeAttached();
    await expect(
      dataPreview.getByText("Widget", { exact: true }).first(),
    ).toBeAttached();
  });
});

test.describe("issue 43057", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should differentiate between date and datetime filters with 00:00 time (metabase#43057)", async ({
    page,
  }) => {
    await openOrdersTable(page);

    // set the date and verify the filter and results
    await tableHeaderClick(page, "Created At");
    let scope = popover(page);
    await scope.getByText("Filter by this column", { exact: true }).click();
    await scope.getByText("Fixed date range…", { exact: true }).click();
    await scope.getByText("On", { exact: true }).click();
    const dateInput = scope.getByLabel("Date", { exact: true });
    await dateInput.click();
    await dateInput.fill("");
    await dateInput.pressSequentially("November 18, 2027");
    let dataset = waitForDataset(page);
    await scope
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await dataset;
    await assertQueryBuilderRowCount(page, 16);
    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("Created At is on Nov 18, 2027", { exact: true }),
    ).toBeVisible();

    // set time to 00:00 and verify the filter and results
    await page
      .getByTestId("qb-filters-panel")
      .getByText("Created At is on Nov 18, 2027", { exact: true })
      .click();
    scope = popover(page);
    await scope.getByRole("button", { name: "Add time", exact: true }).click();
    await expect(scope.getByLabel("Time", { exact: true })).toHaveValue("00:00");
    dataset = waitForDataset(page);
    await scope
      .getByRole("button", { name: "Update filter", exact: true })
      .click();
    await dataset;
    await assertQueryBuilderRowCount(page, 1);
    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("Created At is Nov 18, 2027, 12:00 AM", { exact: true }),
    ).toBeVisible();

    // remove time and verify the filter and results
    await page
      .getByTestId("qb-filters-panel")
      .getByText("Created At is Nov 18, 2027, 12:00 AM", { exact: true })
      .click();
    scope = popover(page);
    await expect(scope.getByLabel("Time", { exact: true })).toHaveValue("00:00");
    await scope
      .getByRole("button", { name: "Remove time", exact: true })
      .click();
    dataset = waitForDataset(page);
    await scope
      .getByRole("button", { name: "Update filter", exact: true })
      .click();
    await dataset;
    await assertQueryBuilderRowCount(page, 16);
    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("Created At is on Nov 18, 2027", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 19894", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should show all columns when using the join column selecter (metabase#19894)", async ({
    mb,
    page,
  }) => {
    await createQuestion(mb.api, {
      name: "Q1",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
    });

    await createQuestion(mb.api, {
      name: "Q2",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["sum", ["field", PRODUCTS.PRICE, null]]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
    });

    await createQuestion(mb.api, {
      name: "Q3",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["avg", ["field", PRODUCTS.RATING, null]]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
    });

    await startNewQuestion(page);

    await expect(miniPicker(page)).toBeAttached();
    await searchMiniPickerAndSelect(page, "Q1");

    await page.getByRole("button", { name: "Join data", exact: true }).click();

    await searchMiniPickerAndSelect(page, "Q2");

    await popover(page).getByText("Category", { exact: true }).click();
    await popover(page).getByText("Category", { exact: true }).click();

    await page.getByRole("button", { name: "Join data", exact: true }).click();

    await searchMiniPickerAndSelect(page, "Q3");

    await expect(
      popover(page).getByText("Category", { exact: true }),
    ).toBeVisible();
    await expect(popover(page).getByText("Count", { exact: true })).toBeVisible();

    await popover(page).getByText("Q1", { exact: true }).click();
    await popover(page).getByText("Q2", { exact: true }).click();

    await expect(
      popover(page).getByText("Q2 - Category → Category", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("Q2 - Category → Sum of Price", { exact: true }),
    ).toBeVisible();

    await popover(page).getByText("Q1", { exact: true }).click();

    await expect(
      popover(page).getByText("Category", { exact: true }),
    ).toBeVisible();
    await expect(popover(page).getByText("Count", { exact: true })).toBeVisible();
  });
});

test.describe("issue 44637", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not crash when rendering a line/bar chart with empty results (metabase#44637)", async ({
    mb,
    page,
  }) => {
    const { id } = await createNativeQuestion(mb.api, {
      native: {
        query: "SELECT '2023-01-01'::date, 2 FROM people WHERE false",
      },
    });
    await visitQuestion(page, id);

    await assertQueryBuilderRowCount(page, 0);
    await expect(
      page.getByTestId("query-builder-main").getByText("No results", {
        exact: true,
      }),
    ).toBeAttached();

    await queryBuilderFooter(page)
      .getByRole("button", { name: "Visualization", exact: true })
      .click();
    const sidebar = leftSidebar(page);
    await sidebar.getByTestId("more-charts-toggle").click();
    await icon(sidebar, "bar").click();

    const main = page.getByTestId("query-builder-main");
    await expect(main.getByText("No results", { exact: true })).toBeAttached();
    await expect(
      main.getByText("Something's gone wrong", { exact: true }),
    ).toHaveCount(0);

    await icon(queryBuilderFooter(page), "calendar").click();
    await expect(
      rightSidebar(page).getByText("Create event", { exact: true }),
    ).toBeVisible();
  });
});

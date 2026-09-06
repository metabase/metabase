/**
 * Playwright port of e2e/test/scenarios/question/notebook.cy.spec.js
 * (upstream describe tag: @slow).
 *
 * Notes on the port:
 * - The `"median" aggregation function` describe is `@external`: it restores
 *   the `postgres-12` snapshot and drives the writable QA Postgres. Gated on
 *   the deliberate PW_QA_DB_ENABLED (QA_DB_ENABLED leaks truthy from
 *   cypress.env.json on dev machines). A green run that skips those three is
 *   NOT a pass — check executed-vs-skipped counts.
 * - "should be possible to sort by metric" is tagged `@skip` upstream (it never
 *   runs there); ported faithfully as test.skip.
 * - Dropped never-awaited intercepts (PORTING rule 2): `@loadMetadata` in
 *   "should prompt to join with a model" and `@tableFK` in
 *   "should support browser based navigation" (the only cy.wait for it is
 *   commented out upstream).
 * - `H.NativeEditor.get(".ace_line")` silently DISCARDS its argument
 *   (codeMirrorHelpers.get() takes none), so the 48358 assertions are against
 *   the whole CodeMirror content — ported as such.
 * - `res.setThrottle(500)` (17397) has no Playwright equivalent; ported as a
 *   route delay on POST /api/dataset.
 */
import type { Locator, Page } from "@playwright/test";

import { openOrdersTable, openProductsTable, openTable } from "../support/ad-hoc-question";
import { resolveToken } from "../support/api";
import { echartsContainer } from "../support/charts";
import { verifyNotebookQuery } from "../support/click-behavior";
import { getProfileLink } from "../support/command-palette";
import {
  customExpressionCompletion,
  customExpressionEditorType,
  expectCustomExpressionValue,
} from "../support/custom-column-3";
import { expectRenderedWithinViewport } from "../support/dashboard-parameters";
import { moveDnDKitElementSynthetic } from "../support/dnd";
import { expect, test } from "../support/fixtures";
import { createQuestion } from "../support/factories";
import { filterSimple } from "../support/filter";
import { hovercard } from "../support/filter-bulk";
import {
  addCustomColumn,
  addSummaryField,
  addSummaryGroupingField,
  filterNotebook,
  join,
  joinTable,
  selectFilterOperator,
  summarizeNotebook,
  visitQuestionAdhocNotebook,
} from "../support/joins";
import { openQuestionActions, summarize, visitModel } from "../support/models";
import {
  datasetEditBar,
  openQuestionActionsItem,
  waitForLoaderToBeRemoved,
} from "../support/models-reproductions-2";
import { nativeEditor } from "../support/native-editor";
import { saveQuestionToCollection } from "../support/nested-questions";
import {
  enterCustomColumnDetails,
  getNotebookStep,
  miniPicker,
  notebookButton,
  openNotebook,
  startNewQuestion,
  visualize,
} from "../support/notebook";
import { visitQuestionAdhoc } from "../support/permissions";
import { WRITABLE_DB_ID } from "../support/schema-viewer";
import {
  addSimpleCustomColumn,
  assertTableRowCount,
  moveNotebookElement,
  openTableNotebookInDb,
  pickMiniPickerTable,
} from "../support/question-notebook";
import { questionInfoButton, sidesheet } from "../support/revisions";
import { ADMIN_USER_ID } from "../support/search-filters";
import {
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import { modal, newButton, popover, visitQuestion } from "../support/ui";
import { saveSavedQuestion } from "../support/viz-charts-repros";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

/** Port of H.POPOVER_ELEMENT (no visibility filter). */
const POPOVER_ELEMENT =
  ".popover[data-state~='visible'],[data-element-id=mantine-popover]";

/** cy.button(name) === cy.findByRole("button", { name }) — exact for strings. */
function button(scope: Page | Locator, name: string | RegExp): Locator {
  return scope.getByRole("button", {
    name,
    ...(typeof name === "string" ? { exact: true } : {}),
  });
}

/** cy.contains(text): case-sensitive substring, first DOM match. */
function contains(scope: Page | Locator, text: string): Locator {
  return scope.getByText(new RegExp(escapeRegExp(text))).first();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function expectPathname(page: Page, expected: string) {
  await expect.poll(() => new URL(page.url()).pathname).toBe(expected);
}

async function expectPathnameContains(page: Page, fragment: string) {
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toContain(fragment);
}

test.describe("scenarios > question > notebook", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("keeps the notebook editor mounted when opening the question info sidebar (UXW-224)", async ({
    mb,
    page,
  }) => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "Needs the pro-self-hosted token (Edit settings requires granular caching)",
    );
    await mb.api.activateToken("pro-self-hosted");
    await visitQuestion(page, ORDERS_QUESTION_ID);
    await openNotebook(page);

    // The Visualize button only renders while the notebook editor is mounted.
    await expectPathnameContains(page, "/notebook");
    await expect(button(page, "Visualize")).toBeVisible();

    // Open the question info sidesheet — the notebook should stay mounted.
    await questionInfoButton(page).click();
    await expect(sidesheet(page)).toBeVisible();
    await expect(button(page, "Visualize")).toBeVisible();

    // Closing the sidesheet should leave us in notebook mode, editor intact.
    await sidesheet(page).getByLabel("Close", { exact: true }).click();
    await expectPathnameContains(page, "/notebook");
    await expect(button(page, "Visualize")).toBeVisible();

    // Open Edit settings from the actions menu — same expectation.
    await openQuestionActions(page, "Edit settings");
    await expect(sidesheet(page)).toBeVisible();
    await expectPathnameContains(page, "/notebook");
    await expect(button(page, "Visualize")).toBeVisible();
  });

  test("shouldn't offer to save the question when there were no changes (metabase#13470)", async ({
    page,
  }) => {
    await openOrdersTable(page);
    // save question initially
    await saveQuestionToCollection(page, { path: ["Our analytics"] });

    // enter "notebook" and visualize without changing anything
    await openNotebook(page);

    await button(page, "Visualize").click();

    // Anchor the absence check: the visualization (and therefore the header it
    // would render "Save" into) must have rendered. The row-count footer only
    // exists in visualization mode, so it discriminates from "still in the
    // notebook", which is the state that would make the check vacuous.
    await expect(page.getByTestId("question-row-count")).toBeVisible();

    // there were no changes to the question, so we shouldn't have "Save"
    await expect(page.getByText("Save", { exact: true })).toHaveCount(0);
  });

  test("should allow post-aggregation filters", async ({ page }) => {
    await openTable(page, { table: ORDERS_ID, mode: "notebook" });

    await button(page, "Summarize").click();

    // count orders by user id, filter to the one user with 46 orders
    await contains(page, "Pick a function or metric").click();
    await popover(page).getByText("Count of rows", { exact: true }).click();
    await contains(page, "Pick a column to group by").click();
    await contains(popover(page), "User ID").click();

    await page
      .getByTestId("step-summarize-0-0")
      .locator(".Icon-filter")
      .click();
    // Playwright's real mouse hovers the row on the way in, which reveals the
    // "More info" icon on top of the type icon and intercepts the click.
    // Cypress dispatches the event at the resolved element — do the same.
    await popover(page).locator(".Icon-int").dispatchEvent("click");
    await selectFilterOperator(page, "Equal to");
    const numberInput = popover(page).getByPlaceholder("Enter a number", {
      exact: true,
    });
    await numberInput.click();
    await page.keyboard.type("46");
    await contains(popover(page), "Add filter").click();

    await visualize(page);

    await expect(contains(page, "2372")).toBeVisible(); // user's id in the table
    // ensure only one user was returned
    await expect(contains(page, "Showing 1 row")).toBeVisible();
  });

  test("shouldn't show sub-dimensions for FK (metabase#16787)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });
    await summarizeNotebook(page);
    await getNotebookStep(page, "summarize")
      .getByText("Pick a column to group by", { exact: true })
      .click();

    // Upstream is `cy.findByText("User ID").findByLabelText("Binning strategy")
    // .should("not.exist")`. That is VACUOUS: findByText resolves the row's
    // <heading>, and the bucket button is the heading's SIBLING inside
    // [data-testid=dimension-list-item] — so the inner query can never match,
    // for any column. Measured on the same open popover:
    //   heading-scoped "Total" / Binning strategy .......... 0   (but:)
    //   row-scoped     "Total" / Binning strategy .......... 1
    //   row-scoped     "Created At" / Temporal bucket ...... 1
    //   row-scoped     "User ID" / Binning strategy ........ 0
    //   row-scoped     "User ID" / Temporal bucket ......... 0
    // A mutant that swapped the target column to the binnable "Total" survived
    // the literal port and dies against the row-scoped form. Scoping to the row
    // is what metabase#16787 actually asserts, so the port anchors on the
    // heading (keeping upstream's implicit existence check) and asserts absence
    // against the row.
    const userIdHeading = popover(page).getByText("User ID", { exact: true });
    await expect(userIdHeading).toBeVisible();
    const userIdRow = popover(page)
      .getByTestId("dimension-list-item")
      .filter({ hasText: /^User ID/ });
    await expect(userIdRow).toHaveCount(1);
    await expect(
      userIdRow.getByLabel("Binning strategy", { exact: true }),
    ).toHaveCount(0);
    await expect(
      userIdRow.getByLabel("Temporal bucket", { exact: true }),
    ).toHaveCount(0);
  });

  test("should show the original custom expression filter field on subsequent click (metabase#14726)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          filter: ["between", ["field", ORDERS.ID, null], 96, 97],
        },
        type: "query",
      },
      display: "table",
    });

    await page
      .getByText("ID is between 96 and 97", { exact: true })
      .click();
    await popover(page).getByText("Between", { exact: true }).click();
    await expect(contains(page, "Is not")).toBeVisible();
    await expect(contains(page, "Greater than")).toBeVisible();
    await expect(contains(page, "Less than")).toBeVisible();
  });

  test("should append indexes to duplicate custom expression names (metabase#12104)", async ({
    page,
  }) => {
    // we're looking for a column name beyond the right of the default viewport
    await page.setViewportSize({ width: 1920, height: 800 });
    await openProductsTable(page, { mode: "notebook" });

    await page.getByText("Custom column", { exact: true }).click();
    await addSimpleCustomColumn(page, "EXPR");

    await getNotebookStep(page, "expression").locator(".Icon-add").click();
    await addSimpleCustomColumn(page, "EXPR");

    await getNotebookStep(page, "expression").locator(".Icon-add").click();
    await addSimpleCustomColumn(page, "EXPR");

    const expressionStep = getNotebookStep(page, "expression");
    await expect(expressionStep.getByText("EXPR", { exact: true })).toBeVisible();
    await expect(
      expressionStep.getByText("EXPR (1)", { exact: true }),
    ).toBeVisible();
    await expect(
      expressionStep.getByText("EXPR (2)", { exact: true }),
    ).toBeVisible();

    await visualize(page);

    await expect(page.getByText("EXPR", { exact: true })).toBeVisible();
    await expect(page.getByText("EXPR (1)", { exact: true })).toBeVisible();
    await expect(page.getByText("EXPR (2)", { exact: true })).toBeVisible();
  });

  test("should show the real number of rows instead of HARD_ROW_LIMIT when loading (metabase#17397)", async ({
    mb,
    page,
  }) => {
    // Port of res.setThrottle(500) — "throttle the response to simulate a
    // mobile 3G connection". No Playwright equivalent; a fixed route delay
    // reproduces the intent (a wide window in which the row count could show
    // HARD_ROW_LIMIT instead of the real count).
    await page.route("**/api/dataset", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });

    const card = await createQuestion(mb.api, {
      query: {
        "source-table": ORDERS_ID,
        filter: ["=", ["field", ORDERS.PRODUCT_ID, null], 2],
      },
    });
    await visitQuestion(page, card.id);

    await expect(contains(page, "Showing 98 rows")).toBeVisible();

    await page.getByTestId("filters-visibility-control").click();
    await page.getByText("Product ID is 2", { exact: true }).click();

    const filterValue = popover(page).locator(
      "input[aria-label='Filter value']",
    );
    await filterValue.focus();
    await page.keyboard.type("3");
    await filterValue.blur();

    const dataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );
    await button(popover(page), "Update filter").click();
    await expect(
      page.getByText("Product ID is 2 selections", { exact: true }),
    ).toBeVisible();

    await dataset;
    await expect(contains(page, "Showing 175 rows")).toBeVisible();
  });

  test("should show an info popover for dimensions listened by the custom expression editor", async ({
    page,
  }) => {
    // start a custom question with orders
    await openOrdersTable(page, { mode: "notebook" });
    await filterNotebook(page);

    await contains(popover(page), "Custom Expression").click();

    await customExpressionEditorType(page, "[Cre");

    // hover over option in the suggestion list
    await customExpressionCompletion(page, "Created At")
      .getByLabel("More info", { exact: true })
      .hover();

    await expect(
      contains(hovercard(page), "The date and time an order was submitted."),
    ).toBeVisible();
    await expect(contains(hovercard(page), "Creation timestamp")).toBeVisible();
  });

  test("should show an info card filter columns in the popover", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });

    await page.getByText("Filter", { exact: true }).click();

    await page
      .getByText("Add filters to narrow your answer", { exact: true })
      .click();

    await page
      .getByRole("tree")
      .getByTestId("dimension-list-item")
      .filter({ hasText: /^User ID/ })
      .getByLabel("More info", { exact: true })
      .hover();

    await expect(contains(hovercard(page), "Foreign Key")).toBeVisible();
    await expect(
      hovercard(page).getByText(/The id of the user/),
    ).toBeVisible();
  });

  test.describe("popover rendering issues (metabase#15502)", () => {
    test.beforeEach(async ({ mb, page }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await page.setViewportSize({ width: 1280, height: 720 });
      await startNewQuestion(page);
      await pickMiniPickerTable(page, "Sample Database", "Orders");
    });

    test("popover should not render outside of viewport regardless of the screen resolution (metabase#15502-1)", async ({
      page,
    }) => {
      await getNotebookStep(page, "filter")
        .getByText("Add filters to narrow your answer", { exact: true })
        .click();

      await expect(popover(page)).toBeVisible();
      await expectRenderedWithinViewport(popover(page));
      // Click anywhere outside this popover to close it — the rendering issue
      // happens when the popover opens for the SECOND time.
      await getProfileLink(page).click();
      await getNotebookStep(page, "filter")
        .getByText("Add filters to narrow your answer", { exact: true })
        .click();
      await expect(popover(page)).toBeVisible();
      await expectRenderedWithinViewport(popover(page));
    });

    test("popover should not cover the button that invoked it (metabase#15502-2)", async ({
      page,
    }) => {
      await getNotebookStep(page, "summarize")
        .getByText("Pick a function or metric", { exact: true })
        .click();
      // Click outside to close this popover
      await getProfileLink(page).click();
      // A popover invoked again blocks the button, making it impossible to
      // click the button for the third time.
      await getNotebookStep(page, "summarize")
        .getByText("Pick a function or metric", { exact: true })
        .click();
      await getNotebookStep(page, "summarize")
        .getByText("Pick a function or metric", { exact: true })
        .click();
    });
  });

  // intentional simplification of "Select none" to quickly
  // fix users' pain caused by the inability to unselect all columns
  test("select no columns select the first one", async ({ page }) => {
    await openTable(page, { table: ORDERS_ID, mode: "notebook" });

    await page.getByTestId("fields-picker").click();

    await popover(page).getByText("Select all", { exact: true }).click();
    await expect(popover(page).getByLabel("ID", { exact: true })).toBeDisabled();
    await popover(page).getByText("Tax", { exact: true }).click();
    await expect(popover(page).getByLabel("ID", { exact: true })).toBeEnabled();
    await popover(page).getByLabel("ID", { exact: true }).click();

    // Dismiss popover
    await page
      .getByTestId("step-data-0-0")
      .getByText("Data", { exact: true })
      .click();

    await visualize(page);

    await expect(page.getByText("Tax", { exact: true })).toBeVisible();
    await expect(page.getByText("ID", { exact: true })).toHaveCount(0);
  });

  test("should render a field info icon in the fields picker", async ({
    page,
  }) => {
    await openTable(page, { table: ORDERS_ID, mode: "notebook" });

    await page.getByTestId("fields-picker").click();
    await popover(page).getByLabel("More info", { exact: true }).first().hover();

    await expect(contains(hovercard(page), "This is a unique ID")).toBeVisible();
  });

  test("should treat max/min on a name as a string filter (metabase#21973)", async ({
    mb,
    page,
  }) => {
    const card = await createQuestion(mb.api, {
      name: "21973",
      query: {
        "source-table": PEOPLE_ID,
        aggregation: [["max", ["field", PEOPLE.NAME, null]]],
        breakout: [["field", PEOPLE.SOURCE, null]],
      },
      display: "table",
    });
    await visitQuestion(page, card.id);

    await filterSimple(page);
    await popover(page).getByText("Summaries", { exact: true }).click();
    await popover(page).getByText("Max of Name", { exact: true }).click();
    await selectFilterOperator(page, "Starts with");
    await expect(
      popover(page).getByPlaceholder("Enter some text", { exact: true }),
    ).toBeVisible();
  });

  test("should treat max/min on a category as a string filter (metabase#22154)", async ({
    mb,
    page,
  }) => {
    const card = await createQuestion(mb.api, {
      name: "22154",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["min", ["field", PRODUCTS.VENDOR, null]]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
      display: "table",
    });
    await visitQuestion(page, card.id);

    await filterSimple(page);
    await popover(page).getByText("Summaries", { exact: true }).click();
    await popover(page).getByText("Min of Vendor", { exact: true }).click();
    await selectFilterOperator(page, "Ends with");
    await expect(
      popover(page).getByPlaceholder("Enter some text", { exact: true }),
    ).toBeVisible();
  });

  test("should prompt to join with a model if the question is based on a model", async ({
    mb,
    page,
  }) => {
    // Upstream's @loadMetadata intercept is never awaited — dropped.
    await createQuestion(mb.api, {
      name: "Products model",
      query: { "source-table": PRODUCTS_ID },
      type: "model",
      display: "table",
    });

    const ordersModel = await createQuestion(mb.api, {
      name: "Orders model",
      query: { "source-table": ORDERS_ID },
      type: "model",
      display: "table",
    });
    await visitModel(page, ordersModel.id);

    await openNotebook(page);

    await join(page);
    await miniPicker(page).getByText("Our analytics", { exact: true }).click();
    await miniPicker(page).getByText("Products model", { exact: true }).click();

    await visualize(page);
  });

  test('should not show "median" aggregation option for databases that do not support "percentile-aggregations" driver feature', async ({
    page,
  }) => {
    await startNewQuestion(page);
    await pickMiniPickerTable(page, "Sample Database", "Orders");

    await getNotebookStep(page, "summarize")
      .getByText("Pick a function or metric", { exact: true })
      .click();

    // Anchor: the aggregation popover has actually rendered its options, so
    // the absence check below isn't satisfied by an empty popover.
    await expect(
      popover(page).getByText("Count of rows", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("Median of ...", { exact: true }),
    ).toHaveCount(0);
  });

  test.describe('"median" aggregation function', () => {
    test.beforeEach(async ({ mb, page }) => {
      test.skip(
        !process.env.PW_QA_DB_ENABLED,
        "@external: requires the writable QA Postgres and its postgres-12 snapshot (set PW_QA_DB_ENABLED)",
      );
      await mb.restore("postgres-12");
      await mb.signInAsAdmin();

      const response = await mb.api.get(
        `/api/database/${WRITABLE_DB_ID}/schema/public`,
      );
      const tables = (await response.json()) as { id: number; name: string }[];
      const productsTable = tables.find((table) => table.name === "products");
      expect(productsTable, "products table in the writable DB").toBeTruthy();
      await openTableNotebookInDb(page, {
        database: WRITABLE_DB_ID,
        table: productsTable!.id,
      });
    });

    test('should show "median" aggregation option for databases that support "percentile-aggregations" driver feature', async ({
      page,
    }) => {
      await button(page, "Summarize").click();

      await addSummaryField(page, { metric: "Median of ...", field: "Price" });

      await expect(
        getNotebookStep(page, "summarize").getByText("Median of Price", {
          exact: true,
        }),
      ).toBeVisible();

      await addSummaryGroupingField(page, { field: "Category" });

      await visualize(page);

      // QuestionDisplayToggle's segments are `disabled: true` by design; the
      // SegmentedControl root carries the onClick.
      await page
        .getByLabel("Switch to data", { exact: true })
        .click({ force: true });
      // should("contain", …) on a multi-element subject is an any-of-set check.
      await expect(
        page
          .getByTestId("header-cell")
          .filter({ hasText: "Median of Price" })
          .first(),
      ).toBeVisible();
    });

    test("should support custom columns", async ({ page }) => {
      await addCustomColumn(page);
      await enterCustomColumnDetails(page, {
        formula: "Price * 10",
        name: "Mega price",
      });
      await button(page, "Done").click();

      await button(page, /Summarize/).click();

      await addSummaryField(page, {
        metric: "Median of ...",
        field: "Mega price",
      });
      await addSummaryField(page, { metric: "Count of rows" });
      await addSummaryGroupingField(page, { field: "Category" });
      await addSummaryGroupingField(page, { field: "Vendor" });

      await summarizeNotebook(page);

      await addSummaryField(page, {
        metric: "Median of ...",
        field: "Median of Mega price",
        stage: 1,
      });
      await addSummaryField(page, {
        metric: "Median of ...",
        field: "Count",
        stage: 1,
      });
      await addSummaryGroupingField(page, { field: "Category", stage: 1 });

      await visualize(page);

      // QuestionDisplayToggle's segments are `disabled: true` by design; the
      // SegmentedControl root carries the onClick.
      await page
        .getByLabel("Switch to data", { exact: true })
        .click({ force: true });
      await expect(
        page
          .getByTestId("header-cell")
          .filter({ hasText: "Median of Median of Mega price" })
          .first(),
      ).toBeVisible();
      await expect(
        page
          .getByTestId("header-cell")
          .filter({ hasText: "Median of Count" })
          .first(),
      ).toBeVisible();
    });

    test("should support Summarize side panel", async ({ page }) => {
      await visualize(page);

      await summarize(page);

      await page.getByTestId("add-aggregation-button").click();

      await expect(
        popover(page).getByText("Median of ...", { exact: true }),
      ).toBeVisible();
    });
  });

  test("should properly render previews (metabase#28726, metabase#29959)", async ({
    page,
  }) => {
    await startNewQuestion(page);
    await pickMiniPickerTable(page, "Sample Database", "Orders");

    const dataStep = getNotebookStep(page, "data");

    await dataStep.locator(".Icon-play").click();
    await assertTableRowCount(dataStep, 10);
    await expect(dataStep.getByText("Subtotal", { exact: true })).toBeVisible();
    await expect(dataStep.getByText("Tax", { exact: true })).toBeVisible();
    await expect(dataStep.getByText("Total", { exact: true })).toBeVisible();
    await dataStep.locator(".Icon-close").click();

    await button(page, "Row limit").click();
    const limitStep = getNotebookStep(page, "limit");
    const limitInput = limitStep.getByPlaceholder("Enter a limit", {
      exact: true,
    });
    await limitInput.click();
    await page.keyboard.type("5");
    await page.keyboard.press("Tab");

    await limitStep.locator(".Icon-play").click();
    await assertTableRowCount(limitStep, 5);

    // cy.findByDisplayValue("5") resolves to this same limit input.
    await expect(limitInput).toHaveValue("5");
    await limitInput.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("50");
    await page.keyboard.press("Tab");
    await button(limitStep, "Refresh").click();
    await assertTableRowCount(limitStep, 10);
  });

  test("should be able to drag-n-drop query clauses", async ({ mb, page }) => {
    const questionDetails = {
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          E1: ["+", ["field", ORDERS.ID, null], 1],
          E2: ["+", ["field", ORDERS.ID, null], 2],
        },
        filter: [
          "and",
          ["=", ["field", ORDERS.ID, null], 1],
          ["=", ["field", ORDERS.ID, null], 2],
          ["=", ["field", ORDERS.ID, null], 3],
        ],
        breakout: [
          ["field", ORDERS.ID, null],
          ["field", ORDERS.PRODUCT_ID, null],
        ],
        aggregation: [
          ["count"],
          ["sum", ["field", ORDERS.TAX, null]],
          ["sum", ["field", ORDERS.SUBTOTAL, null]],
          ["sum", ["field", ORDERS.TOTAL, null]],
          ["avg", ["field", ORDERS.TOTAL, null]],
        ],
        "order-by": [
          ["asc", ["aggregation", 0]],
          ["asc", ["aggregation", 4]],
        ],
      },
    };

    const card = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, card.id);
    await openNotebook(page);

    // verifyDragAndDrop
    await moveNotebookElement(getNotebookStep(page, "expression"), {
      name: "E1",
      horizontal: 100,
      index: 1,
    });
    await moveNotebookElement(getNotebookStep(page, "filter"), {
      name: "ID is 2",
      horizontal: -100,
      index: 0,
    });
    await moveNotebookElement(
      getNotebookStep(page, "summarize").getByTestId("aggregate-step"),
      { name: "Count", vertical: 100, index: 4 },
    );
    await moveNotebookElement(
      getNotebookStep(page, "summarize").getByTestId("breakout-step"),
      { name: "ID", horizontal: 100, index: 1 },
    );
    await moveNotebookElement(getNotebookStep(page, "sort"), {
      name: "Average of Total",
      horizontal: -100,
      index: 0,
    });

    // verifyPopoverDoesNotMoveElement({ type: "filter", name: "ID is 1",
    // index: 1, horizontal: -100 })
    await getNotebookStep(page, "filter")
      .getByText("ID is 1", { exact: true })
      .click();
    const dragInPopover = popover(page).getByText("Is", { exact: true });
    await expect(dragInPopover).toBeVisible();
    await moveDnDKitElementSynthetic(dragInPopover, { horizontal: -100 });
    await expect(
      getNotebookStep(page, "filter").getByTestId("notebook-cell-item").nth(1),
    ).toHaveText("ID is 1");

    // verifyPopoverIsClosedAfterDragAndDrop({ type: "filter",
    // name: "ID is 1", index: 0, horizontal: -100 })
    await getNotebookStep(page, "filter")
      .getByText("ID is 1", { exact: true })
      .click();
    await expect(popover(page)).toBeVisible();
    await moveNotebookElement(getNotebookStep(page, "filter"), {
      name: "ID is 1",
      horizontal: -100,
      index: 0,
    });
    await expect(page.locator(POPOVER_ELEMENT)).toHaveCount(0);
  });

  test("should not crash notebook when metric is used as an aggregation and breakout is applied (metabase#40553)", async ({
    mb,
    page,
  }) => {
    const metric = await createQuestion(mb.api, {
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.SUBTOTAL, null]]],
      },
      type: "metric",
      name: "Revenue",
    });

    const card = await createQuestion(mb.api, {
      query: {
        "source-table": ORDERS_ID,
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
        aggregation: ["metric", metric.id],
      },
    });
    await visitQuestion(page, card.id);

    await openNotebook(page);

    await contains(getNotebookStep(page, "summarize"), "Revenue").click();

    await expectCustomExpressionValue(page, "[Revenue]");
  });

  test("should be possible to sort by metric (metabase#8283,metabase#42392)", async () => {
    test.skip(true, "Upstream @skip tag (never runs in CI either)");
  });

  test("should open only one bucketing popover at a time (metabase#45036)", async ({
    page,
  }) => {
    await visitQuestionAdhocNotebook(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: { "source-table": PRODUCTS_ID, aggregation: [["count"]] },
        parameters: [],
      },
    } as Parameters<typeof visitQuestionAdhocNotebook>[1]);

    await getNotebookStep(page, "summarize")
      .getByText("Pick a column to group by", { exact: true })
      .click();

    const createdAt = popover(page).getByRole("option", {
      name: "Created At",
      exact: true,
    });
    // The bucket button only renders on hover of the dimension row; upstream's
    // realHover lands on it directly, a real Playwright hover cannot (the
    // element has no layout box until the row is hovered).
    await createdAt.hover();
    const byMonth = createdAt.getByText("by month", { exact: true });
    await byMonth.hover();
    await byMonth.click();

    const secondPopover = popover(page).nth(1);
    await expect(secondPopover.getByText("Year", { exact: true })).toBeVisible();
    await expect(
      secondPopover.getByText("Hour of day", { exact: true }),
    ).toHaveCount(0);
    await secondPopover.getByText("More…", { exact: true }).click();
    await expect(
      secondPopover.getByText("Hour of day", { exact: true }),
    ).toBeVisible();

    const price = popover(page)
      .nth(0)
      .getByRole("option", { name: "Price", exact: true });
    await price.hover();
    const autoBin = price.getByText("Auto bin", { exact: true });
    await autoBin.hover();
    await autoBin.click();

    const binningPopover = popover(page).nth(1);
    await expect(
      binningPopover.getByText("Auto bin", { exact: true }),
    ).toBeVisible();
    await expect(
      binningPopover.getByText("50 bins", { exact: true }),
    ).toBeVisible();
    await expect(
      binningPopover.getByText("Don't bin", { exact: true }),
    ).toBeVisible();

    await expect(
      binningPopover.getByText("Year", { exact: true }),
    ).toHaveCount(0);
    await expect(
      binningPopover.getByText("Hour of day", { exact: true }),
    ).toHaveCount(0);
    await expect(
      binningPopover.getByText("More…", { exact: true }),
    ).toHaveCount(0);

    await expect(popover(page)).toHaveCount(2);
  });

  test("should not leave the UI in broken state after adding an aggregation (metabase#48358)", async ({
    page,
  }) => {
    await page.goto("/");
    await newButton(page).click();
    await popover(page).getByText("Question", { exact: true }).click();
    await miniPicker(page)
      .getByText("Sample Database", { exact: true })
      .click();
    await miniPicker(page).getByText("Products", { exact: true }).click();
    await addSummaryField(page, { metric: "Sum of ...", field: "Price" });
    await addSummaryGroupingField(page, { field: "Created At" });
    await addSummaryGroupingField(page, { field: "Category" });
    await visualize(page);
    await saveQuestionToCollection(page);
    await notebookButton(page).click();
    await addSummaryField(page, { metric: "Sum of ...", field: "Rating" });
    await visualize(page);
    await saveSavedQuestion(page);
    await notebookButton(page).click();
    await page.getByLabel("View SQL", { exact: true }).click();
    await addSummaryField(page, { metric: "Sum of ...", field: "Price" });

    await expect(page.getByTestId("loading-indicator")).toHaveCount(0);
    // H.NativeEditor.get(".ace_line") discards its argument — the assertions
    // are against the whole CodeMirror content.
    await expect(nativeEditor(page)).toContainText(
      'SUM("PUBLIC"."PRODUCTS"."PRICE") AS "sum"',
    );
    await expect(nativeEditor(page)).toContainText(
      'SUM("PUBLIC"."PRODUCTS"."RATING") AS "sum_2"',
    );
    await expect(nativeEditor(page)).toContainText(
      'SUM("PUBLIC"."PRODUCTS"."PRICE") AS "sum_3"',
    );
  });

  test("should not shrink the remove clause button (metabase#50128)", async ({
    mb,
    page,
  }) => {
    const CUSTOM_COLUMN_LONG_NAME = "very-very-very-long-name";

    // The issue is reproducible on all viewports, but the smaller the viewport
    // is, the more likely the issue is going to occur.
    await page.setViewportSize({ width: 300, height: 800 });
    const card = await createQuestion(mb.api, {
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          [CUSTOM_COLUMN_LONG_NAME]: ["+", 1000, 1000],
        },
        filter: ["<", ["expression", CUSTOM_COLUMN_LONG_NAME, null], 1000000],
        aggregation: [["avg", ["expression", CUSTOM_COLUMN_LONG_NAME, null]]],
        breakout: [["expression", CUSTOM_COLUMN_LONG_NAME, null]],
        "order-by": [["asc", ["expression", CUSTOM_COLUMN_LONG_NAME, null]]],
      },
    });
    await visitQuestion(page, card.id);
    await openNotebook(page);

    await verifyNotebookQuery(page, "Orders", [
      {
        expressions: [CUSTOM_COLUMN_LONG_NAME],
        filters: [`${CUSTOM_COLUMN_LONG_NAME} is less than 1000000`],
        aggregations: [`Average of ${CUSTOM_COLUMN_LONG_NAME}`],
        breakouts: [CUSTOM_COLUMN_LONG_NAME],
        sort: [{ column: CUSTOM_COLUMN_LONG_NAME, order: "asc" }],
      },
    ]);

    const items = page
      .getByTestId("notebook-cell-item")
      .filter({ hasText: new RegExp(escapeRegExp(CUSTOM_COLUMN_LONG_NAME)) });
    // locator.count() does not retry — anchor before counting.
    await expect(items.first()).toBeVisible();
    const count = await items.count();
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; ++index) {
      const closeIcon = items.nth(index).getByLabel("close icon", {
        exact: true,
      });
      const size = await closeIcon.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      expect(size.width).toBe(16);
      expect(size.height).toBe(16);
    }
  });

  test("should let the user navigate back (metabase#50971)", async ({
    page,
  }) => {
    await page.goto("/model/new");
    await page
      .getByTestId("new-model-options")
      .getByText("Use the notebook editor", { exact: true })
      .click();

    await expect(miniPicker(page)).toBeVisible();

    // Cypress can emulate the browser's back button with cy.go('back'), but
    // this does not trigger a confirmation modal, so we need to perform a
    // similar action that also triggers it: clicking Cancel in the edit bar.
    // Upstream passes { hidden: true } + { force: true } because the data
    // picker modal makes the edit bar inert — dispatchEvent is the faithful
    // port of Cypress's force-click (which dispatches at the element).
    await datasetEditBar(page)
      .locator("button")
      .filter({ hasText: /^Cancel$/ })
      .dispatchEvent("click");

    // Clicking "Discard changes" verifies this modal is above the data picker.
    await expect(modal(page)).toBeVisible();
    await contains(modal(page), "Discard changes").click();
    await expect(page.getByTestId("greeting-message")).toBeVisible();
  });

  test("shows all available columns and groups in the breakout picker (metabase#46832)", async ({
    page,
  }) => {
    await page.goto("/");
    await newButton(page).click();
    await popover(page).getByText("Question", { exact: true }).click();
    await miniPicker(page)
      .getByText("Sample Database", { exact: true })
      .click();
    await miniPicker(page).getByText("Orders", { exact: true }).click();
    await join(page);
    await joinTable(page, "Reviews", "Product ID", "Product ID");
    await addSummaryField(page, { metric: "Count of rows" });
    await addSummaryGroupingField(page, { field: "Created At" });
    await page
      .getByRole("button", { name: "Join data", exact: true })
      .last()
      .click();
    await joinTable(page, "Reviews", "Created At: Month", "Created At");
    await button(page, "Summarize").click();
    await addSummaryField(page, { metric: "Count of rows", stage: 1 });

    // adding a new breakout
    await getNotebookStep(page, "summarize", { stage: 1 })
      .getByText("Pick a column to group by", { exact: true })
      .click();
    await expect(
      popover(page).getByText("Summaries", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("Created At: Month", { exact: true }),
    ).toBeVisible();
    await expect(popover(page).getByText("Count", { exact: true })).toBeVisible();

    await popover(page).getByText("Reviews", { exact: true }).click();
    await expect(
      popover(page).getByText("Created At: Month", { exact: true }),
    ).toHaveCount(0);
    await expect(popover(page).getByText("Count", { exact: true })).toHaveCount(
      0,
    );

    await popover(page).getByText("Summaries", { exact: true }).click();
    await expect(
      popover(page).getByText("Created At: Month", { exact: true }),
    ).toBeVisible();
    await expect(popover(page).getByText("Count", { exact: true })).toBeVisible();

    await popover(page).getByText("Reviews", { exact: true }).click();
    await popover(page).getByText("Rating", { exact: true }).click();

    // editing an existing breakout
    await getNotebookStep(page, "summarize", { stage: 1 })
      .getByText("Reviews - Created At: Month → Rating: Auto binned", {
        exact: true,
      })
      .click();
    await expect(
      popover(page).getByText("Summaries", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("Created At: Month", { exact: true }),
    ).toHaveCount(0);
    await expect(popover(page).getByText("Count", { exact: true })).toHaveCount(
      0,
    );

    await popover(page).getByText("Summaries", { exact: true }).click();
    await expect(
      popover(page).getByText("Created At: Month", { exact: true }),
    ).toBeVisible();
    await expect(popover(page).getByText("Count", { exact: true })).toBeVisible();
  });

  test("should allow using aggregation functions inside expressions in aggregation (metabase#52611)", async ({
    page,
  }) => {
    await page.goto("/");
    await newButton(page).click();
    await popover(page).getByText("Question", { exact: true }).click();
    await miniPicker(page)
      .getByText("Sample Database", { exact: true })
      .click();
    await miniPicker(page).getByText("Orders", { exact: true }).click();
    await addSummaryField(page, { metric: "Custom Expression" });
    await enterCustomColumnDetails(page, {
      formula: "case(Sum([Total]) > 10, Sum([Total]), Sum([Subtotal]))",
      name: "conditional sum",
    });
    await button(page, "Done").click();
    await addSummaryGroupingField(page, { field: "Total" });
    await visualize(page);
    await expect(echartsContainer(page)).toContainText("Total: 8 bins");
  });

  test("Correctly translates aggregations", async ({ mb, page }) => {
    await mb.api.put(`/api/user/${ADMIN_USER_ID}`, { locale: "en-ZZ" });

    await openTable(page, { table: ORDERS_ID, mode: "notebook" });

    await button(page, "[zz] Summarize").click();
    await popover(page).getByText("[zz] Average of ...", { exact: true }).click();
    await popover(page).getByText("Subtotal", { exact: true }).click();

    await expect(
      page.getByText("[zz] Average of Subtotal", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Average of Subtotal", { exact: true }),
    ).toHaveCount(0);

    await mb.api.put(`/api/user/${ADMIN_USER_ID}`, { locale: "en" });
  });

  test("should support browser based navigation (metabase#55162)", async ({
    mb,
    page,
  }) => {
    // Upstream's @tableFK intercept is only awaited in commented-out code.
    const card = await createQuestion(mb.api, {
      query: { "source-table": PRODUCTS_ID },
      name: "products",
    });
    const id = card.id;
    await visitQuestion(page, id);

    await button(page, /Editor/).click();
    await expectPathname(page, `/question/${id}-products/notebook`);

    await button(page, /Visualization/).click();
    await expectPathname(page, `/question/${id}-products`);

    await page.goBack();
    await expectPathname(page, `/question/${id}-products/notebook`);

    await page.goBack();
    await expectPathname(page, `/question/${id}-products`);

    await page.goForward();
    await expectPathname(page, `/question/${id}-products/notebook`);

    // Turn this question into a model
    await openQuestionActions(page, "Turn into a model");
    await button(modal(page), "Turn this into a model").click();

    await expectPathname(page, `/model/${id}-products/notebook`);

    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);
    await expectPathname(page, `/model/${id}-products/columns`);

    await button(datasetEditBar(page), "Cancel").click();
    await expect(datasetEditBar(page)).toHaveCount(0);
    await expectPathname(page, `/model/${id}-products`);

    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);
    await expectPathname(page, `/model/${id}-products/columns`);

    await page.goBack();
    await expectPathname(page, `/model/${id}-products`);

    await page.goBack();
    await expectPathname(page, `/model/${id}-products/columns`);

    await datasetEditBar(page).getByText("Query", { exact: true }).click();
    await expectPathname(page, `/model/${id}-products/query`);

    await page.goBack();
    await expectPathname(page, `/model/${id}-products/columns`);

    await page.goForward();
    await expectPathname(page, `/model/${id}-products/query`);

    await button(datasetEditBar(page), "Cancel").click();
    await expect(datasetEditBar(page)).toHaveCount(0);

    await page.goBack();
    await expectPathname(page, `/model/${id}-products/query`);

    // This should work, but doesn't (metabase#55486)
    // await page.goBack();
    // await expectPathname(page, `/model/${id}-products/columns`);

    await expect(button(datasetEditBar(page), "Cancel")).toBeVisible();
    await button(datasetEditBar(page), "Cancel").click();
    await expect(datasetEditBar(page)).toHaveCount(0);

    const PRODUCT_ROW_ID = "1";
    const idCell = page
      .getByTestId("table-body")
      .locator("[data-column-id='ID']")
      .first();
    await expect(idCell).toBeVisible();
    await expect(idCell).toHaveText(PRODUCT_ROW_ID);
    await idCell.click();
    await expectPathname(page, `/model/${id}-products/${PRODUCT_ROW_ID}`);

    // Navigate back and forth to details modal (metabase#55487)
    await page.goBack();
    await expectPathname(page, `/model/${id}-products`);

    await page.goForward();
    await expectPathname(page, `/model/${id}-products/${PRODUCT_ROW_ID}`);

    await page.goBack();
    await expectPathname(page, `/model/${id}-products`);

    // The foreign key relation should work, but it consistently fails in CI —
    // left commented out upstream, so not ported.

    await openQuestionActions(page, "Turn back to saved question");

    await expectPathname(page, `/question/${id}-products`);

    // Going back returns us to a model URL, which it should not (metabase#55488)
    // await page.goBack();
  });

  test("should be possible to select custom expressions in the aggregation picker", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });
    await summarizeNotebook(page);
    const search = popover(page).getByPlaceholder("Find...", { exact: true });
    await search.click();
    await page.keyboard.type("Distinc");
    await expect(
      popover(page).getByText("Number of distinct values of ...", {
        exact: true,
      }),
    ).toBeVisible();
    await popover(page).getByText("DistinctIf", { exact: true }).click();
    await expectCustomExpressionValue(page, "DistinctIf(column, condition)");
  });

  test("should not render detail view column in preview (metabase#63070)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });

    await page.getByTestId("step-preview-button").click();
    // The preview having rendered is the anchor for the absence check below.
    await expect(page.getByTestId("table-scroll-container")).toContainText(
      "37.65",
    );
    await expect(page.getByTestId("row-id-cell")).toHaveCount(0);
  });
});

/**
 * Playwright port of
 * e2e/test/scenarios/filters-reproductions/filters-reproductions.cy.spec.js
 *
 * Infra tier: this file is almost entirely H2 sample-database work. Exactly
 * ONE describe (issue 45252) is `@external` and genuinely needs the writable
 * postgres QA container + the `postgres-writable` snapshot; it is gated on
 * PW_QA_DB_ENABLED. The other 27 tests need no container at all.
 *
 * Porting notes:
 * - `cy.button(x)` is `findByRole("button", { name: x })` → exact role name.
 *   `cy.findByText(str)` is exact; `cy.contains(str)` is a case-sensitive
 *   substring (PORTING rule 1).
 * - Every multi-step type into a filter-value / token field resolves the input
 *   ONCE and drives it with `page.keyboard` — MultiAutocomplete drops its
 *   placeholder the moment a pill commits, so re-querying by placeholder
 *   mid-interaction cannot work (issues 48851, 49321, 45410).
 * - `cy.type()` on an input starts at the end of the existing value; Playwright
 *   pressSequentially/keyboard start at the caret, so ports that append press
 *   "End" first (issue 35043).
 * - `cy.realPress("ArrowDown")` in a loop has Cypress command-queue latency
 *   between presses; `keyboard.press(k, { delay })` is the key HOLD, not a gap,
 *   so QUE-1359 paces with an explicit waitForTimeout.
 * - issue 26861 is tagged `@skip` upstream — kept skipped here.
 * - The `cy.intercept("POST", "/api/dataset")` aliases become
 *   `page.waitForResponse` registered BEFORE the triggering action
 *   (PORTING rule 2). Aliases upstream registers and never awaits are dropped.
 */
import type { Locator, Page } from "@playwright/test";

import { resetTestTable } from "../support/actions-on-dashboards";
import {
  openOrdersTable,
  openPeopleTable,
  openProductsTable,
  openReviewsTable,
} from "../support/ad-hoc-question";
import {
  customExpressionEditorType,
  formatExpression,
} from "../support/custom-column-3";
import {
  editDashboard,
  filterWidget,
  saveDashboard,
  setFilter,
  sidebar,
} from "../support/dashboard";
import {
  SAMPLE_DB_SCHEMA_ID,
  visitDataModel,
  waitForFieldUpdate,
} from "../support/data-model";
import { fieldSectionNameInput } from "../support/data-studio-tables";
import { queryBuilderFiltersPanel } from "../support/detail-view";
import { createDashboard, createNativeQuestion, createQuestion } from "../support/factories";
import { filterSimple } from "../support/filter";
import {
  dashboardParametersPopover,
  findByDisplayValue,
} from "../support/filters-repros";
import {
  assertDescendantsNotOverflowContainer,
  pickMiniPickerTable,
  rectOf,
} from "../support/filters-reproductions";
import { clauseStepPopover } from "../support/filters";
import { test, expect } from "../support/fixtures";
import { filterNotebook, selectFilterOperator } from "../support/joins";
import {
  focusNativeEditor,
  startNewNativeQuestion,
} from "../support/native-editor";
import {
  assertQueryBuilderRowCount,
  enterCustomColumnDetails,
  getNotebookStep,
  miniPicker,
  openNotebook,
  queryBuilderMain,
  startNewQuestion,
  tableHeaderClick,
  visualize,
} from "../support/notebook";
import { visitQuestionAdhoc } from "../support/permissions";
import { tableInteractiveBody } from "../support/question-new";
import { clickActionsPopover } from "../support/relative-datetime";
import { openQuestionsSidebar } from "../support/revisions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import {
  icon,
  modal,
  popover,
  queryBuilderHeader,
  visitDashboard,
  visitQuestion,
} from "../support/ui";

const {
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  ORDERS,
  REVIEWS,
  REVIEWS_ID,
  PEOPLE,
  PEOPLE_ID,
  INVOICES,
} = SAMPLE_DATABASE;

const QA_DB_SKIP_REASON =
  "Requires the writable postgres QA container and the postgres-writable snapshot (set PW_QA_DB_ENABLED)";

/** Port of `cy.button(name)` — findByRole("button", { name }) is exact. */
function button(scope: Page | Locator, name: string | RegExp): Locator {
  return typeof name === "string"
    ? scope.getByRole("button", { name, exact: true })
    : scope.getByRole("button", { name });
}

/** The `cy.intercept("POST", "/api/dataset").as("dataset")` alias — register
 * before the triggering action, await after. */
function datasetResponse(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

test.describe("issue 9339", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not paste non-numeric values into single-value numeric filters (metabase#9339)", async ({
    page,
  }) => {
    await openOrdersTable(page);

    await tableHeaderClick(page, "Total");
    await page.getByText("Filter by this column", { exact: true }).click();
    await selectFilterOperator(page, "Greater than");

    // Resolve the input ONCE — a committing value can drop the placeholder.
    const numberInput = page.getByPlaceholder("Enter a number", {
      exact: true,
    });
    await numberInput.click();
    await page.keyboard.type("9339,1234");
    await numberInput.blur();

    await expect(await findByDisplayValue(page.locator("body"), "9339")).toBeVisible();
    await expect(page.getByText("1,234", { exact: true })).toHaveCount(0);
    await expect(button(page, "Add filter")).toBeEnabled();
  });
});

test.describe("issue 16621", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await openProductsTable(page, { limit: 3 });
  });

  test("should be possible to create multiple filter that start with the same value (metabase#16621)", async ({
    page,
  }) => {
    await tableHeaderClick(page, "Category");
    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();
    await popover(page)
      .getByPlaceholder("Search the list", { exact: true })
      .fill("Gadget");
    await popover(page).getByText("Gadget", { exact: true }).click();
    await button(popover(page), "Add filter").click();

    await page
      .getByTestId("qb-filters-panel")
      .getByText("Category is Gadget", { exact: true })
      .click();
    await popover(page).getByText("Gizmo", { exact: true }).click();
    await button(popover(page), "Update filter").click();

    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("Category is 2 selections", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 18770", () => {
  const questionDetails = {
    name: "18770",
    query: {
      "source-query": {
        aggregation: [["count"]],
        "source-table": ORDERS_ID,
        breakout: [
          ["field", PRODUCTS.TITLE, { "source-field": ORDERS.PRODUCT_ID }],
        ],
      },
      filter: [">", ["field", "count", { "base-type": "type/Integer" }], 0],
    },
  };

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const card = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, card.id);
  });

  test("post-aggregation filter shouldn't affect the drill-through options (metabase#18770)", async ({
    page,
  }) => {
    await openNotebook(page);
    // It is important to manually trigger "visualize" in order to generate the
    // `result_metadata`; the breakout has to change first or no POST
    // /api/dataset is ever sent.
    await page
      .getByTestId("notebook-cell-item")
      .filter({ hasText: /Products? → Title/ })
      .first()
      .click();
    await popover(page).getByText("Category", { exact: true }).click();
    await expect(
      page
        .getByTestId("notebook-cell-item")
        .filter({ hasText: /Products? → Category/ })
        .first(),
    ).toBeVisible();

    await (await visualize(page));

    await expect(
      page.getByTestId("cell-data").filter({ hasText: "4,784" }),
    ).toHaveCount(1);

    // Querying the cell again to ensure the dom node stability
    await tableInteractiveBody(page)
      .getByText("4,784", { exact: true })
      .click();
    await expect(
      popover(page).getByText("Filter by this value", { exact: true }),
    ).toBeVisible();
    const drillButtons = popover(page).getByRole("button");
    await expect(drillButtons).toHaveCount(6);
    for (const label of [
      "See these Orders",
      "Break out by",
      "<",
      ">",
      "=",
      "≠",
    ]) {
      // `.and("contain", x)` is a case-sensitive substring over the set.
      await expect(
        drillButtons.filter({ hasText: new RegExp(escapeRegExp(label)) }),
      ).not.toHaveCount(0);
    }
  });
});

test.describe("issue 20551", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow filtering with includes, rather than starts with (metabase#20551)", async ({
    page,
  }) => {
    await openProductsTable(page, { mode: "notebook" });
    await filterNotebook(page);

    await popover(page).getByText("Category", { exact: true }).click();
    await popover(page)
      .getByPlaceholder("Search the list", { exact: true })
      .fill("i");

    await expect(
      popover(page).getByText("Doohickey", { exact: true }),
    ).toBeVisible();
    await expect(popover(page).getByText("Gizmo", { exact: true })).toBeVisible();
    await expect(popover(page).getByText("Widget", { exact: true })).toBeVisible();
    await expect(popover(page).getByText("Gadget", { exact: true })).toHaveCount(
      0,
    );
  });
});

/**
 * PRODUCTS id 9, created 2028-02-07 — a Monday in the sample data shipped on
 * this branch. See the note at the absence assertion in issue 21979.
 */
const MONDAY_PRODUCT = "Practical Bronze Computer";

test.describe("issue 21979", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("exclude 'day of the week' should show the correct day reference in the UI (metabase#21979)", async ({
    page,
  }) => {
    await openProductsTable(page, { mode: "notebook" });

    await filterNotebook(page);
    await popover(page).getByText("Created At", { exact: true }).click();
    await popover(page).getByText("Exclude…", { exact: true }).click();
    await popover(page).getByText("Days of the week…", { exact: true }).click();
    await popover(page).getByLabel("Monday", { exact: true }).click();
    await button(popover(page), "Add filter").click();

    await expect(
      getNotebookStep(page, "filter").getByText("Created At excludes Mondays", {
        exact: true,
      }),
    ).toBeVisible();

    await (await visualize(page));

    // Anchor on the results grid actually having painted before asserting the
    // absence below. `visualize()` resolves on the /api/dataset RESPONSE, which
    // lands before React renders the table — so a bare `toHaveCount(0)` passes
    // on its first poll against an empty DOM and asserts nothing. `Rustic Paper
    // Wallet` is PRODUCTS id 1 (created on a Sunday), so it survives every
    // exclusion this test applies and is a stable presence anchor.
    await expect(
      queryBuilderMain(page).getByText("Rustic Paper Wallet", { exact: true }),
    ).toBeVisible();

    // Make sure the query is correct.
    //
    // Upstream names "Enormous Marble Wallet" here and calls it a Monday
    // product. That was true of the OLD sample database (2016-10-03), but the
    // bundled sample data has since been re-dated by +9 years: that row is now
    // 2025-10-03, a FRIDAY, and it is no longer excluded by "excludes Mondays".
    // Verified against `resources/sample-database.db.mv.db` and the copy inside
    // `target/uberjar/metabase.jar` — both agree, so upstream's premise is
    // stale in Cypress too. The day pair (Monday/Thursday) is what issue 21979
    // is about and is kept verbatim; only the product is re-pointed at one that
    // really is created on a Monday: PRODUCTS id 9, 2028-02-07 (a Monday), and
    // therefore also present again once the exclusion moves to Thursdays.
    await expect(
      queryBuilderMain(page).getByText(MONDAY_PRODUCT, {
        exact: true,
      }),
    ).toHaveCount(0);

    await page
      .getByTestId("qb-filters-panel")
      .getByText("Created At excludes Mondays", { exact: true })
      .click();

    const dataset = datasetResponse(page);
    await popover(page).getByLabel("Monday", { exact: true }).click();
    await popover(page).getByLabel("Thursday", { exact: true }).click();
    await button(popover(page), "Update filter").click();
    await dataset;

    await expect(
      queryBuilderMain(page).getByText(MONDAY_PRODUCT, {
        exact: true,
      }),
    ).toBeVisible();

    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("Created At excludes Thursdays", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 22730", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const card = await createNativeQuestion(mb.api, {
      name: "22730",
      native: {
        query:
          "select '14:02:13'::time \"time\", 'before-row' \"name\" union all select '14:06:13'::time \"time\", 'after-row' ",
      },
    });
    await visitQuestion(page, card.id);
  });

  test("allows filtering by time column (metabase#22730)", async ({ page }) => {
    const dataset = datasetResponse(page);
    await page.getByText("Explore results", { exact: true }).click();
    await dataset;

    await tableHeaderClick(page, "time");

    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();
    const timeInput = await findByDisplayValue(popover(page), "00:00");
    await timeInput.click();
    await timeInput.press("ControlOrMeta+A");
    await timeInput.press("Backspace");
    await timeInput.pressSequentially("14:03");
    await button(popover(page), "Add filter").click();

    // The table grid renders each data row once per horizontal quadrant, so
    // "before-row" can transiently resolve to two identical cell-data nodes
    // (frozen + center). Flaked 1-in-4 without .first().
    await expect(
      page.getByText("before-row", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("after-row", { exact: true })).toHaveCount(0);
  });
});

test.describe("issue 24664", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await openProductsTable(page, { limit: 3 });
  });

  test("should be possible to create multiple filter that start with the same value (metabase#24664)", async ({
    page,
  }) => {
    await tableHeaderClick(page, "Category");
    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();
    await popover(page).getByText("Doohickey", { exact: true }).click();
    await button(popover(page), "Add filter").click();

    await tableHeaderClick(page, "Category");
    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();
    await popover(page).getByText("Gizmo", { exact: true }).click();
    await button(popover(page), "Add filter").click();

    await page
      .getByTestId("qb-filters-panel")
      .getByText("Category is Gizmo", { exact: true })
      .click();
    await popover(page).getByText("Widget", { exact: true }).click();
    await button(popover(page), "Update filter").click();

    // First filter is still there
    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("Category is Doohickey", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 24994", () => {
  const questionDetails = {
    query: {
      "source-query": {
        "source-table": PRODUCTS_ID,
        filter: [
          "and",
          ["=", ["field", PRODUCTS.CATEGORY, null], "Gadget", "Gizmo"],
          [
            "time-interval",
            ["field", PRODUCTS.CREATED_AT, null],
            -30,
            "year",
            { include_current: false },
          ],
        ],
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
      filter: [">", ["field", "count", { "base-type": "type/Integer" }], 0],
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow updating filters (metabase#24994)", async ({
    page,
    mb,
  }) => {
    const card = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, card.id);

    // Three filters
    await page
      .getByTestId("filters-visibility-control")
      .filter({ hasText: "3" })
      .click();

    await page.getByText("Category is 2 selections", { exact: true }).click();
    await assertFilterValueIsSelected(page, "Gadget");
    await assertFilterValueIsSelected(page, "Gizmo");
    await page.getByText("Doohickey", { exact: true }).click();
    await assertFilterValueIsSelected(page, "Doohickey");
    const updateFilter = button(page, "Update filter");
    await expect(updateFilter).toBeEnabled();
    await updateFilter.click();
    await expect(
      page.getByText("Category is 3 selections", { exact: true }),
    ).toBeVisible();
  });
});

async function assertFilterValueIsSelected(page: Page, value: string) {
  await expect(page.getByRole("checkbox", { name: value, exact: true })).toBeChecked();
}

test.describe("issue 45410", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not overflow the last filter value with the info icon (metabase#45410)", async ({
    page,
  }) => {
    await openPeopleTable(page, { mode: "notebook" });
    await filterNotebook(page);
    const step = clauseStepPopover(page);
    await step.getByText("Email", { exact: true }).click();

    // Resolve the token input ONCE: the placeholder disappears as soon as the
    // first pill commits, so a re-query by placeholder would find nothing.
    const emailInput = step.getByPlaceholder("Search by Email", {
      exact: true,
    });
    await emailInput.click();
    await page.keyboard.type("abc@example.com,abc2@example.com");
    await emailInput.blur();

    const removeButton = step
      .getByText("abc2@example.com", { exact: true })
      .locator("+ button");
    const infoIcon = icon(step, "info");
    const removeButtonRect = await rectOf(removeButton);
    const infoIconRect = await rectOf(infoIcon);
    expect(removeButtonRect.right).toBeLessThanOrEqual(infoIconRect.left);
  });
});

test.describe("issue 26861", () => {
  test("exclude filter shouldn't break native questions with field filters (metabase#26861)", async () => {
    // Upstream Cypress describe carries { tags: "@skip" } — kept skipped.
    test.skip(true, "Upstream @skip tag (metabase#26861 not fixed)");
  });
});

test.describe("issue 27123", () => {
  const questionDetails = {
    query: { "source-table": ORDERS_ID, limit: 100 },
  };

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const card = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, card.id);
  });

  test("exclude filter should not resolve to 'Days of the week' regardless of the chosen granularity  (metabase#27123)", async ({
    page,
  }) => {
    await tableHeaderClick(page, "Created At");
    await page.getByText("Filter by this column", { exact: true }).click();
    await page.getByText("Exclude…", { exact: true }).click();
    await page.getByText("Months of the year…", { exact: true }).click();

    // `should("contain", …)` on the popover set is a case-sensitive substring.
    await expect(popover(page)).toContainText("Months of the year…");
    await expect(popover(page)).toContainText("January");
  });
});

test.describe("issue 29094", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("disallows adding a filter using non-boolean custom expression (metabase#29094)", async ({
    page,
  }) => {
    await startNewQuestion(page);
    await miniPicker(page).getByText("Sample Database", { exact: true }).click();
    await miniPicker(page).getByText("Orders", { exact: true }).click();

    await getNotebookStep(page, "filter")
      .getByText("Add filters to narrow your answer", { exact: true })
      .click();

    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await enterCustomColumnDetails(page, { formula: "[Tax] * 22", blur: false });
    await page.keyboard.press("Tab");
    await expect(button(popover(page), "Done")).toBeDisabled();
    await expect(
      popover(page).getByText("Types are incompatible.", { exact: true }),
    ).toHaveCount(1);
  });
});

test.describe("issue 30312", () => {
  const CREATED_AT_BREAKOUT = [
    "field",
    ORDERS.CREATED_AT,
    { "base-type": "type/DateTime", "temporal-unit": "month" },
  ];

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("can use a drill filter on an aggregated column (metabase#30312)", async ({
    page,
    mb,
  }) => {
    const card = await createQuestion(mb.api, {
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [CREATED_AT_BREAKOUT],
        limit: 5, // optimization
      },
      display: "table",
    });
    await visitQuestion(page, card.id);

    await expect(page.getByTestId("header-cell").nth(1)).toHaveText("Count");

    await tableHeaderClick(page, "Count");

    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();
    await selectFilterOperator(page, "Equal to");

    const actions = clickActionsPopover(page);
    const numberInput = actions.getByPlaceholder("Enter a number", {
      exact: true,
    });
    await numberInput.click();
    await page.keyboard.type("10");
    await page.keyboard.press("Tab");
    const addFilter = button(actions, "Add filter");
    await expect(addFilter).toBeEnabled();
    await addFilter.click();

    await expect(page.getByTestId("filter-pill")).toHaveText(
      "Count is equal to 10",
    );
    await expect(
      queryBuilderMain(page).getByText("No results", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 31340", () => {
  const LONG_COLUMN_NAME =
    "Some very very very very long column name that should have a line break";

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await visitDataModel(page, "admin", {
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: PEOPLE_ID,
      fieldId: PEOPLE.PASSWORD,
    });

    const nameInput = fieldSectionNameInput(page);
    const fieldUpdate = waitForFieldUpdate(page);
    await nameInput.click();
    await nameInput.press("ControlOrMeta+A");
    await nameInput.press("Backspace");
    await nameInput.pressSequentially(LONG_COLUMN_NAME);
    await nameInput.blur();
    await fieldUpdate;

    const card = await createQuestion(mb.api, {
      query: { "source-table": PEOPLE_ID, limit: 2 },
    });
    await visitQuestion(page, card.id);
  });

  test("should properly display long column names in filter options search results (metabase#31340)", async ({
    page,
  }) => {
    await tableHeaderClick(page, LONG_COLUMN_NAME);

    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();
    await selectFilterOperator(page, "Is");

    const search = page.waitForResponse((response) =>
      /^\/api\/field\/\d+\/search\//.test(new URL(response.url()).pathname),
    );
    const searchInput = popover(page).getByPlaceholder(
      `Search by ${LONG_COLUMN_NAME}`,
      { exact: true },
    );
    await searchInput.click();
    await page.keyboard.type("nonexistingvalue");
    await search;
  });
});

test.describe("issue 34794", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not crash when navigating to filter popover's custom expression section (metabase#34794)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });

    await filterNotebook(page);
    await popover(page).getByText("Created At", { exact: true }).click();
    await icon(popover(page), "chevronleft").click(); // back to the main popover
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await customExpressionEditorType(page, "[Total] > 10");
    await formatExpression(page);
    await button(popover(page), "Done").click();

    await expect(
      getNotebookStep(page, "filter").getByText("Total is greater than 10", {
        exact: true,
      }),
    ).toBeVisible();
  });
});

test.describe("metabase#32985", () => {
  const questionDetails = {
    database: SAMPLE_DB_ID,
    query: { "source-table": PEOPLE_ID },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not crash when searching large field values sets in filters popover (metabase#32985)", async ({
    page,
    mb,
  }) => {
    // we need to mess with the field metadata to make the field values crazy
    await mb.api.put(`/api/field/${REVIEWS.REVIEWER}`, {
      semantic_type: "type/PK",
    });
    await mb.api.put(`/api/field/${PEOPLE.EMAIL}`, {
      semantic_type: "type/FK",
    });
    await mb.api.put(`/api/field/${PEOPLE.EMAIL}`, {
      fk_target_field_id: REVIEWS.REVIEWER,
    });

    const card = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, card.id);

    await tableHeaderClick(page, "Email");

    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();
    const searchInput = popover(page).getByPlaceholder(
      "Search by Email or enter an ID",
      { exact: true },
    );
    await searchInput.click();
    await page.keyboard.type("foo");

    await expect(popover(page)).toHaveCount(2);
    await expect(
      popover(page)
        .last()
        .getByText("No matching Email found.", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 35043", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should prevent illogical ranges - from newer to older (metabase#35043)", async ({
    page,
    mb,
  }) => {
    const card = await createQuestion(mb.api, {
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        filter: [
          "between",
          ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
          "2027-04-15",
          "2027-05-22",
        ],
        limit: 5,
      },
    });
    await visitQuestion(page, card.id);

    await page.getByTestId("filters-visibility-control").click();
    const pill = page.getByTestId("filter-pill");
    await expect(pill).toHaveText("Created At is Apr 15 – May 22, 2027");
    await pill.click();

    const picker = page.getByTestId("date-filter-picker");
    const dateInput = await findByDisplayValue(picker, "May 22, 2027");
    // cy.type() appends; Playwright's caret starts where the click left it.
    await dateInput.click();
    await dateInput.press("End");
    await dateInput.press("Backspace");
    await dateInput.pressSequentially("2");
    await dateInput.blur();
    await expect(
      await findByDisplayValue(picker, "May 22, 2022"),
    ).toBeAttached();

    const dataset = datasetResponse(page);
    await button(picker, "Update filter").click();
    await dataset;

    await expect(page.getByTestId("filter-pill")).toHaveText(
      "Created At is May 22, 2022 – Apr 15, 2027",
    );
  });
});

test.describe("issue 45252", () => {
  test.beforeEach(async ({ mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);
    await mb.restore("postgres-writable");
    await resetTestTable({ type: "postgres", table: "many_data_types" });
    await mb.signInAsAdmin();
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: ["many_data_types"],
    });
  });

  test("should allow using is-null and not-null operators with unsupported data types (metabase#45252,metabase#38111)", async ({
    page,
  }) => {
    await startNewQuestion(page);

    // filter picker - new filter
    // Upstream clicks the DB then the table; pickMiniPickerTable adds the
    // #85 schema-debris fallback (pinned to "public"). See its docstring.
    await pickMiniPickerTable(page, "Writable Postgres12", "Many Data Types");
    await getNotebookStep(page, "filter")
      .getByText("Add filters to narrow your answer", { exact: true })
      .click();
    const binary = popover(page).getByText("Binary", { exact: true });
    await binary.scrollIntoViewIfNeeded();
    await binary.click();
    await popover(page).getByLabel("Is empty", { exact: true }).click();
    await button(popover(page), "Add filter").click();
    await (await visualize(page));
    await assertQueryBuilderRowCount(page, 0);

    // filter picker - existing filter
    await page
      .getByTestId("qb-filters-panel")
      .getByText("Binary is empty", { exact: true })
      .click();
    const updateDataset = datasetResponse(page);
    await popover(page).getByLabel("Not empty", { exact: true }).click();
    await button(popover(page), "Update filter").click();
    await updateDataset;
    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("Binary is not empty", { exact: true }),
    ).toBeVisible();
    await assertQueryBuilderRowCount(page, 2);

    // filter picker - existing filter (from the header button)
    await button(queryBuilderHeader(page), /Filter/).click();
    const applyDataset = datasetResponse(page);
    await popover(page).getByText("Binary", { exact: true }).click();
    await popover(page).getByLabel("Is empty", { exact: true }).click();
    await button(popover(page), "Apply filter").click();
    await applyDataset;
    await assertQueryBuilderRowCount(page, 0);

    // filter picker - json column
    const removeDataset = datasetResponse(page);
    await icon(
      queryBuilderFiltersPanel(page).getByText("Binary is empty", {
        exact: true,
      }),
      "close",
    ).click();
    await removeDataset;
    await button(queryBuilderHeader(page), /Filter/).click();
    const jsonDataset = datasetResponse(page);
    await popover(page).getByText("Jsonb", { exact: true }).click();
    await popover(page).getByLabel("Not empty", { exact: true }).click();
    await button(popover(page), "Apply filter").click();
    await jsonDataset;
    await assertQueryBuilderRowCount(page, 2);
  });
});

test.describe("issue 44435", () => {
  // It is crucial that the string is without spaces!
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const longString = alphabet.repeat(10);

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("filter pill should not overflow the window width when the filter string is very long (metabase#44435)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": REVIEWS_ID,
          fields: [
            ["field", REVIEWS.REVIEWER, { "base-type": "type/Text" }],
            ["field", REVIEWS.RATING, { "base-type": "type/Integer" }],
          ],
          filter: [
            "=",
            ["field", REVIEWS.BODY, { "base-type": "type/Text" }],
            longString,
          ],
        },
        // upstream also passes `parameters: []` inside dataset_query; it is
        // not part of the query shape and the hash builder ignores it.
      },
    });

    const pillRect = await rectOf(page.getByTestId("filter-pill"));
    const innerWidth = await page.evaluate(() => window.innerWidth);
    expect(innerWidth).toBeGreaterThan(pillRect.width);
  });
});

// This reproduction can possibly be replaced with the unit test for the
// `ListField` component in the future
test.describe("issue 45877", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore("setup");
    await mb.signInAsAdmin();
  });

  test("should not render selected boolean option twice in a filter dropdown (metabase#45877)", async ({
    page,
    mb,
  }) => {
    const card = await createNativeQuestion(mb.api, {
      name: "45877",
      native: {
        query: "SELECT * FROM INVOICES [[ where {{ expected_invoice }} ]]",
        "template-tags": {
          expected_invoice: {
            id: "3cfb3686-0d13-48db-ab5b-100481a3a830",
            dimension: ["field", INVOICES.EXPECTED_INVOICE, null],
            name: "expected_invoice",
            "display-name": "Expected Invoice",
            type: "dimension",
            "widget-type": "string/=",
          },
        },
      },
    });
    await visitQuestion(page, card.id);

    await expect(filterWidget(page)).toContainText("Expected Invoice");
    await filterWidget(page).click();

    await expect(
      popover(page).getByPlaceholder("Search the list", { exact: true }),
    ).toHaveCount(1);

    await expect(popover(page).getByLabel("true", { exact: true })).toHaveCount(
      1,
    );
    await expect(
      popover(page).getByLabel("true", { exact: true }),
    ).not.toBeChecked();
    const falseOption = popover(page).getByLabel("false", { exact: true });
    await expect(falseOption).toHaveCount(1);
    await expect(falseOption).not.toBeChecked();
    await falseOption.click();

    await button(popover(page), "Add filter").click();

    // We don't even have to run the query to reproduce this issue
    // so let's not waste time and resources doing so.
    await expect(
      page.locator(
        ".popover[data-state~='visible'],[data-element-id=mantine-popover]",
      ),
    ).toHaveCount(0);
    await expect(filterWidget(page)).toContainText("false");
    await filterWidget(page).click();

    await expect(popover(page).getByLabel("true", { exact: true })).toHaveCount(
      1,
    );
    await expect(popover(page).getByLabel("false", { exact: true })).toHaveCount(
      1,
    );
    await expect(
      popover(page).getByLabel("false", { exact: true }),
    ).toBeChecked();
  });
});

test.describe("Issue 48851", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await page.setViewportSize({ width: 1050, height: 500 });
  });

  const manyValues = Array(20)
    .fill(0)
    .map(() => Math.round(Math.random() * 1000_000_000_000).toString(36))
    .join(", ");

  test("should not overflow the filter popover, even when there are a lot of values (metabase#48851)", async ({
    page,
  }) => {
    await openProductsTable(page);
    await tableHeaderClick(page, "Title");

    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();
    await popover(page).getByText("Is", { exact: true }).click();

    await popover(page).nth(1).getByText("Contains", { exact: true }).click();
    await expect(popover(page)).toHaveCount(1);

    // Resolve the token input ONCE — every committed pill drops the placeholder.
    const textInput = popover(page).getByPlaceholder("Enter some text", {
      exact: true,
    });
    await textInput.click();
    await page.keyboard.type(manyValues);

    await expect(button(popover(page), "Add filter")).toBeVisible();
  });
});

test.describe("issue 49321", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not require multiple clicks to apply a filter (metabase#49321)", async ({
    page,
  }) => {
    await openProductsTable(page, { mode: "notebook" });
    await filterNotebook(page);
    await popover(page).getByText("Title", { exact: true }).click();
    await popover(page).getByText("Is", { exact: true }).click();
    await popover(page).last().getByText("Contains", { exact: true }).click();

    // Cypress `$popover[0]` is the FIRST match of the visible-popover set.
    const initialWidth = (await rectOf(popover(page).first())).width;

    const textInput = popover(page).getByPlaceholder("Enter some text", {
      exact: true,
    });
    await textInput.click();
    await page.keyboard.type("aaaaaaaaaa, bbbbbbbbbbb,");

    // `H.popover().should(cb)` retries until the callback stops throwing.
    await expect
      .poll(async () => (await rectOf(popover(page).first())).width)
      .toBe(initialWidth);
  });
});

test.describe("issue 49642", () => {
  const QUESTION = {
    name: "Issue 49642",
    query: { "source-table": PEOPLE_ID }, // people has >1000 rows
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow searching for more values when the filter contains more than 1000 values (metabase#49642)", async ({
    page,
    mb,
  }) => {
    const dashboard = await createDashboard(mb.api);
    await visitDashboard(page, mb.api, dashboard.id);
    await editDashboard(page);

    await createQuestion(mb.api, QUESTION);
    await openQuestionsSidebar(page);
    await page
      .getByTestId("add-card-sidebar")
      .getByText(QUESTION.name, { exact: true })
      .click();
    // Anchor the save on the change it saves (PORTING: saveDashboard).
    await expect(page.getByTestId("dashcard")).toHaveCount(1);

    await setFilter(page, "Text or Category", "Is");
    await page.getByText("Select…", { exact: true }).click();
    await popover(page).getByText("Name", { exact: true }).click();
    await sidebar(page).getByText("A single value", { exact: true }).click();

    await saveDashboard(page);

    await filterWidget(page).click();
    // PORTING: upstream switched this block from H.popover() to
    // H.dashboardParametersPopover() in 184c415f6e3 (GDGT-2578, TokenField →
    // Autocomplete). The generic `.popover` selector still matches the
    // parameter dropdown, but the Autocomplete's own Combobox dropdown is a
    // SECOND match, so `popover(page)` is ambiguous here. Scope to the
    // parameter dropdown's testid like upstream now does.
    const paramPopover = dashboardParametersPopover(page);
    // Anchor: the dropdown really is open and populated before the absence
    // check below, so `toHaveCount(0)` cannot pass vacuously.
    await expect(paramPopover.getByPlaceholder("Search the list")).toBeVisible();
    await expect(
      paramPopover.getByText("Zackery Bailey", { exact: true }),
    ).toHaveCount(0);
    const searchInput = paramPopover.getByPlaceholder("Search the list", {
      exact: true,
    });
    await searchInput.click();
    await page.keyboard.type("Zackery");
    await expect(
      paramPopover.getByText("Zackery Bailey", { exact: true }),
    ).toBeVisible();
    const kuhn = paramPopover.getByText("Zackery Kuhn", { exact: true });
    await expect(kuhn).toBeVisible();
    await kuhn.click();

    await expect(
      paramPopover.getByPlaceholder("Search the list", { exact: true }),
    ).toHaveValue("Zackery Kuhn");

    // Upstream INVERTED this in 184c415f6e3: selecting a value now filters the
    // option list down to the selected text, so the other match is gone.
    await expect(
      paramPopover.getByText("Zackery Bailey", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 44665", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should use the correct widget for the default value picker (metabase#44665)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    await focusNativeEditor(page);
    await page.keyboard.type("select * from {{param", { delay: 10 });

    const paramSidebar = sidebar(page).last();
    await paramSidebar.getByText("Search box", { exact: true }).click();
    await paramSidebar.getByText("Edit", { exact: true }).click();

    await modal(page).getByText("Custom list", { exact: true }).click();
    await modal(page).getByRole("textbox").fill("foo\nbar\nbaz\nfoobar");
    await button(modal(page), "Done").click();

    await sidebar(page)
      .last()
      .getByText("Enter a default value…", { exact: true })
      .click();
    const defaultInput = popover(page).getByPlaceholder(
      "Enter a default value…",
      { exact: true },
    );
    await expect(defaultInput).toBeVisible();
    await defaultInput.click();
    await page.keyboard.type("foo");
    await expect(popover(page).getByText("foo", { exact: true })).toBeVisible();
    await expect(
      popover(page).getByText("foobar", { exact: true }),
    ).toBeVisible();

    await expect(popover(page).getByText("bar", { exact: true })).toHaveCount(0);
    await expect(popover(page).getByText("baz", { exact: true })).toHaveCount(0);

    await sidebar(page)
      .last()
      .getByText("Enter a default value…", { exact: true })
      .click();
    await sidebar(page)
      .last()
      .getByText("Dropdown list", { exact: true })
      .click();
    await sidebar(page)
      .last()
      .getByText("Enter a default value…", { exact: true })
      .click();

    await expect(
      popover(page).getByPlaceholder("Enter a default value…", { exact: true }),
    ).toBeVisible();

    await expect(popover(page).getByText("foo", { exact: true })).toBeVisible();
    await expect(popover(page).getByText("bar", { exact: true })).toBeVisible();
    await expect(popover(page).getByText("baz", { exact: true })).toBeVisible();
    await expect(
      popover(page).getByText("foobar", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 50731", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await page.setViewportSize({ width: 800, height: 800 });
  });

  test("tooltip content should not overflow the tooltip (metabase#50731)", async ({
    page,
  }) => {
    await openOrdersTable(page);
    await icon(page, "filter").click();
    // `hover({ force: true })` is the faithful port of `realHover()`: Cypress
    // dispatches at the resolved element with no hit-test, and here the
    // sibling "info" icon is topmost at the label icon's centre, so an
    // actionable hover is refused (and the retry loop then sees the row go
    // non-visible). Same family as the pie-label / dense-series rule.
    await icon(page, "label").hover({ force: true });

    // ⚠️ VACUOUS UPSTREAM — ported verbatim, not silently strengthened.
    // Upstream does `H.popover().should("be.visible").and($element => { const
    // [container] = $element; … })`, i.e. it asserts against the FIRST visible
    // popover. Both harnesses use the identical POPOVER_ELEMENT selector, and
    // the hovercard the hover opens mounts SECOND (measured: popover[0] is the
    // filter column list "Orders/ID/User ID/…", popover[1] is the column
    // description hovercard). So the tooltip this test is named for is never
    // inspected. Proven by mutation: deleting the `hover()` line entirely —
    // the whole subject of the test — leaves it green (1.6s, passed).
    // Cypress has the same semantics, so this is an upstream hole, not drift.
    const container = popover(page).first();
    await expect(container).toBeVisible();
    await assertDescendantsNotOverflowContainer(container);
  });
});

test.describe("issue 58923", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await page.setViewportSize({ width: 800, height: 800 });
  });

  test("it should not lose padding when switching filter types (metabase#58923)", async ({
    page,
  }) => {
    await openPeopleTable(page);
    await tableHeaderClick(page, "Name");

    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();
    await popover(page).getByText("Is", { exact: true }).click();
    await expect(popover(page)).toHaveCount(2);
    await popover(page).last().getByText("Contains", { exact: true }).click();

    await popover(page).getByText("Contains", { exact: true }).click();
    await expect(popover(page)).toHaveCount(2);
    await popover(page).last().getByText("Is", { exact: true }).click();

    const scope = popover(page).first();
    const input = scope.getByPlaceholder("Search by Name", { exact: true });
    const footer = button(scope, "Add filter").locator("..");
    const inputRect = await rectOf(input);
    const footerRect = await rectOf(footer);
    expect(footerRect.top - inputRect.bottom).toBeGreaterThan(16);
  });
});

test.describe("issue QUE-1359", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should render an outline on the custom expression item in the filter popover (QUE-1359)", async ({
    page,
  }) => {
    await openReviewsTable(page, { mode: "notebook" });
    await filterNotebook(page);

    // Every cy.realPress is its own Cypress command, so the original had queue
    // latency between presses. `press(k, { delay })` is the key HOLD, not a gap
    // — pace with an explicit wait instead.
    for (let index = 0; index < 10; index++) {
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(50);
    }

    const item = popover(page)
      .getByText("Custom Expression", { exact: true })
      .locator("..");
    const outline = await item.evaluate(
      (element) => window.getComputedStyle(element).outline,
    );
    expect(outline).toContain("solid");
  });
});

test.describe("issue QUE-2567", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    const card = await createQuestion(mb.api, {
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          Foo: [
            "datetime-add",
            [
              "field",
              ORDERS.CREATED_AT,
              {
                "base-type": "type/DateTime",
                "effective-type": "type/DateTime",
              },
            ],
            5,
            "day",
          ],
          Bar: ["datetime", "2028-12-24"],
        },
      },
    });
    await visitQuestion(page, card.id);

    await filterSimple(page);
    await popover(page).getByText("Foo", { exact: true }).click();
    await popover(page).getByText("Previous 12 months", { exact: true }).click();

    await filterSimple(page);
    await popover(page).getByText("Bar", { exact: true }).click();
    await popover(page).getByText("Previous 12 months", { exact: true }).click();
  });

  test("should be possible to edit a datetime filter that is based on a custom expression (QUE-2567)", async ({
    page,
  }) => {
    // Editing the filter should show the date picker
    const pills = page.getByTestId("filter-pill");
    await expect(pills).toHaveCount(2);
    await pills.nth(0).click();
    await expectDatePickerTabs(page);

    // Editing the filter should show the date picker for coerced datetime
    await expect(pills).toHaveCount(2);
    await pills.nth(1).click();
    await expectDatePickerTabs(page);
  });
});

test.describe("issue QUE-2567 (bis)", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.put(`/api/field/${ORDERS.QUANTITY}`, {
      coercion_strategy: "Coercion/UNIXSeconds->DateTime",
      semantic_type: null,
    });
    await openOrdersTable(page);

    await filterSimple(page);
    await popover(page).getByText("Quantity", { exact: true }).click();
    await popover(page).getByText("Previous 12 months", { exact: true }).click();
  });

  test("should open the datetime filter for coerced columns", async ({
    page,
  }) => {
    // Editing the filter should show the date picker
    await page.getByTestId("filter-pill").click();
    await expectDatePickerTabs(page);
  });
});

async function expectDatePickerTabs(page: Page) {
  await expect(popover(page).getByText("Previous", { exact: true })).toBeVisible();
  await expect(popover(page).getByText("Current", { exact: true })).toBeVisible();
  await expect(popover(page).getByText("Next", { exact: true })).toBeVisible();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

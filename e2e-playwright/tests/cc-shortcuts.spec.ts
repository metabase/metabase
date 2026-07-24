/**
 * Playwright port of e2e/test/scenarios/custom-column/cc-shortcuts.cy.spec.ts
 *
 * Snowplow assertions are real, backed by the per-slot collector via
 * ../support/snowplow — same pattern as metrics-question.spec.ts.
 */
import type { Page } from "@playwright/test";

import {
  customExpressionEditor,
  openTableNotebookWithLimit,
} from "../support/custom-column";
import { test, expect } from "../support/fixtures";
import { addCustomColumn } from "../support/joins";
import { expressionEditorWidget } from "../support/notebook";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { popover } from "../support/ui";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

async function selectExtractColumn(page: Page) {
  await popover(page).getByText("Extract columns", { exact: true }).click();
}

async function selectColumnToExtract(page: Page, column: string) {
  // Case-sensitive substring + .first(), matching the Cypress .contains():
  // the picker can list the same column name under several groups (Created At
  // exists on Orders, Products, and People).
  await page
    .getByTestId("dimension-list-item")
    .filter({ hasText: new RegExp(column) })
    .first()
    .click();
}

function extractionButton(page: Page, name: string) {
  // The extraction buttons' accessible names include an example value
  // ("Hour of day 0, 4, 9, …"), so anchor a case-sensitive regex on the name
  // instead of exact-matching ("Year" must not match "Quarter of year").
  return popover(page).getByRole("button", { name: new RegExp(`^${name}`) });
}

test.describe("scenarios > question > custom column > expression shortcuts > extract", () => {
  const DATE_EXTRACTIONS = [
    {
      table: ORDERS_ID,
      column: "Created At",
      name: "Hour of day",
      fn: "hour",
    },
    {
      table: ORDERS_ID,
      column: "Created At",
      name: "Day of month",
      fn: "day",
    },
    {
      table: ORDERS_ID,
      column: "Created At",
      name: "Day of week",
      fn: "weekday",
    },
    {
      table: ORDERS_ID,
      column: "Created At",
      name: "Month of year",
      fn: "month",
    },
    {
      table: ORDERS_ID,
      column: "Created At",
      name: "Quarter of year",
      fn: "quarter",
    },
    {
      table: ORDERS_ID,
      column: "Created At",
      name: "Year",
      fn: "year",
    },
  ];

  const EMAIL_EXTRACTIONS = [
    {
      table: ORDERS_ID,
      column: "Email",
      name: "Domain",
      fn: "domain",
    },
    {
      table: ORDERS_ID,
      column: "Email",
      name: "Host",
      fn: "host",
    },
  ];

  const URL_EXRACTIONS = [
    {
      table: ORDERS_ID,
      column: "Product ID",
      name: "Domain",
      fn: "domain",
    },
    {
      table: ORDERS_ID,
      column: "Product ID",
      name: "Subdomain",
      fn: "subdomain",
    },
    {
      table: ORDERS_ID,
      column: "Product ID",
      name: "Host",
      fn: "host",
    },
  ];

  const EXTRACTIONS = [
    ...EMAIL_EXTRACTIONS,
    ...DATE_EXTRACTIONS,
    ...URL_EXRACTIONS,
  ];

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // Make the PRODUCT_ID column a URL column for these tests, to avoid having to create a new model
    await mb.api.put(`/api/field/${ORDERS.PRODUCT_ID}`, {
      semantic_type: "type/URL",
    });
  });

  for (const extraction of EXTRACTIONS) {
    test(`should be possible to use the ${extraction.name} extraction on ${extraction.column}`, async ({
      page,
    }) => {
      await openTableNotebookWithLimit(page, extraction.table, 1);
      await addCustomColumn(page);
      await selectExtractColumn(page);

      await selectColumnToExtract(page, extraction.column);
      await extractionButton(page, extraction.name).click();

      await expect(customExpressionEditor(page)).toContainText(
        `${extraction.fn}(`,
      );

      await expect(
        expressionEditorWidget(page).getByTestId("expression-name"),
      ).toHaveValue(extraction.name);
    });
  }

  test("should be possible to create the same extraction multiple times", async ({
    page,
  }) => {
    await openTableNotebookWithLimit(page, ORDERS_ID, 5);
    await addCustomColumn(page);
    await selectExtractColumn(page);

    await selectColumnToExtract(page, "Created At");
    await extractionButton(page, "Hour of day").click();

    await expect(
      expressionEditorWidget(page).getByTestId("expression-name"),
    ).toHaveValue("Hour of day");

    await expressionEditorWidget(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await page.getByTestId("notebook-cell-item").last().click();
    await selectExtractColumn(page);

    await selectColumnToExtract(page, "Created At");
    await extractionButton(page, "Hour of day").click();

    await expect(
      expressionEditorWidget(page).getByTestId("expression-name"),
    ).toHaveValue("Hour of day (1)");
  });

  test("should be possible to edit a previous stages' columns when an aggregation is present (metabase#43226)", async ({
    page,
  }) => {
    await openTableNotebookWithLimit(page, ORDERS_ID, 5);

    await page.getByRole("button", { name: "Summarize", exact: true }).click();
    await popover(page).getByText("Count of rows", { exact: true }).click();

    // add custom column
    await page
      .getByTestId("action-buttons")
      .first()
      .locator(".Icon-add_data")
      .click();
    await selectExtractColumn(page);

    await selectColumnToExtract(page, "Created At");
    await extractionButton(page, "Hour of day").click();

    await expect(
      expressionEditorWidget(page).getByTestId("expression-name"),
    ).toHaveValue("Hour of day");
  });
});

// The Cypress original reuses the same describe title; the [snowplow] prefix
// follows the downloads.spec.ts convention for tracking-only blocks.
test.describe("[snowplow] scenarios > question > custom column > expression shortcuts > extract", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await resetSnowplow(mb);
    await mb.signInAsNormalUser();
  });

  test.afterEach(async ({ mb }) => {
    await expectNoBadSnowplowEvents(mb);
  });

  test("should track column extraction via shortcut", async ({ mb, page }) => {
    await openTableNotebookWithLimit(page, ORDERS_ID, 1);
    await addCustomColumn(page);
    await selectExtractColumn(page);

    await selectColumnToExtract(page, "Created At");

    await extractionButton(page, "Hour of day").click();

    await expectUnstructuredSnowplowEvent(mb, {
      event: "column_extract_via_shortcut",
      custom_expressions_used: ["get-hour"],
      database_id: SAMPLE_DB_ID,
      question_id: 0,
    });
  });
});

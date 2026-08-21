/**
 * Playwright port of
 * e2e/test/scenarios/sharing/downloads/sharing-download-reproductions.cy.spec.js
 *
 * A grab-bag of download reproductions — every issue number is preserved.
 *
 * Differences from the Cypress original:
 * - Downloads really complete here: downloadAndAssert (support/downloads.ts)
 *   waits for the browser download and parses the file (asserting the export
 *   request is a 200 with the right content type and that the sheet has rows),
 *   instead of intercepting the export request and redirecting it away. None of
 *   these reproductions passed a content callback, so the assertion — like the
 *   original — is "the export succeeds", now strictly stronger.
 * - issue 18382 skips its csv case (cy.skipOn(fileType === "csv")) via test.skip.
 * - issue 19889's static `it` titles are duplicated across csv/xlsx (a hard load
 *   error in Playwright, tolerated by Cypress) — each is suffixed with the file
 *   type.
 */
import type { Page } from "@playwright/test";

import {
  createNativeQuestion,
  createQuestion,
} from "../support/factories";
import { downloadAndAssert } from "../support/downloads";
import type { ExportFileType } from "../support/downloads";
import { test, expect } from "../support/fixtures";
import { runNativeQuery } from "../support/models";
import {
  focusNativeEditor,
  typeInNativeEditor,
} from "../support/native-editor";
import { visitQuestionAdhoc } from "../support/permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  openNativeEditor,
  remapProductIdToProductTitle,
  reorderColumnAPastColumnB,
  saveAndOverwrite,
} from "../support/sharing-download-reproductions";
import { visitQuestion } from "../support/ui";

const { ORDERS, ORDERS_ID, REVIEWS, REVIEWS_ID, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

const testCases: ExportFileType[] = ["csv", "xlsx"];

test.describe("issue 10803", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const card = await createNativeQuestion(mb.api, {
      name: "10803",
      native: {
        query:
          "SELECT cast(parsedatetime('2026-06-03', 'yyyy-MM-dd') AS timestamp) AS \"birth_date\", cast(parsedatetime('2026-06-03 23:41:23', 'yyyy-MM-dd HH:mm:ss') AS timestamp) AS \"created_at\"",
      },
    });
    // wrapId + visitQuestion: true in the Cypress original.
    (page as PageWithQuestionId).questionId = card.id;
    await visitQuestion(page, card.id);
  });

  for (const fileType of testCases) {
    test(`should format the date properly for ${fileType} in saved questions (metabase#10803)`, async ({
      page,
    }) => {
      const questionId = (page as PageWithQuestionId).questionId;
      await downloadAndAssert(page, { fileType, questionId });
    });

    test(`should format the date properly for ${fileType} in unsaved questions`, async ({
      page,
    }) => {
      // Add a space at the end of the query to make it "dirty".
      await openNativeEditor(page);
      await typeInNativeEditor(page, " ");

      await runNativeQuery(page);
      await downloadAndAssert(page, { fileType });
    });
  }
});

test.describe("issue 18382", () => {
  /**
   * This question might seem a bit overwhelming at the first sight.
   * The whole point of this repro was to try to cover as much of the old syntax
   * as possible. We want to make sure it still works when loaded into a new(er)
   * Metabase version.
   */
  const questionDetails = {
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "query" as const,
      query: {
        "source-table": REVIEWS_ID,
        joins: [
          {
            fields: [["joined-field", "Products", ["field-id", PRODUCTS.TITLE]]],
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field-id", REVIEWS.PRODUCT_ID],
              ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
            ],
            alias: "Products",
          },
        ],
        filter: ["and", ["=", ["field-id", REVIEWS.RATING], 4]],
        "order-by": [
          ["asc", ["joined-field", "Products", ["field-id", PRODUCTS.TITLE]]],
        ],
        fields: [
          ["field-id", REVIEWS.ID],
          ["field-id", REVIEWS.REVIEWER],
        ],
        limit: 5,
      },
    },
    display: "table",
    visualization_settings: {
      column_settings: {
        [`["ref",["field",${REVIEWS.ID},null]]`]: { column_title: "MOD:ID" },
        [`["ref",["field",${REVIEWS.REVIEWER},null]]`]: {
          column_title: "MOD:Reviewer",
        },
        [`["ref",["field",${PRODUCTS.TITLE},null]]`]: {
          column_title: "MOD:Title",
        },
      },
      // Reorder columns
      "table.columns": [
        {
          name: "TITLE",
          fieldRef: ["joined-field", "Products", ["field-id", PRODUCTS.TITLE]],
          enabled: true,
        },
        { name: "ID", fieldRef: ["field-id", REVIEWS.ID], enabled: true },
        {
          name: "REVIEWER",
          fieldRef: ["field-id", REVIEWS.REVIEWER],
          enabled: true,
        },
      ],
    },
  };

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await visitQuestionAdhoc(page, questionDetails);
  });

  for (const fileType of testCases) {
    test(`should handle the old syntax in downloads for ${fileType} (metabase#18382)`, async ({
      page,
    }) => {
      // TODO: Please remove this skip when the issue gets fixed (cy.skipOn(csv)).
      test.skip(fileType === "csv", "csv is skipped upstream (cy.skipOn)");

      await downloadAndAssert(page, { fileType });
    });
  }
});

test.describe("issue 18440", () => {
  const query = { "source-table": ORDERS_ID, limit: 5 };

  const questionDetails = {
    dataset_query: {
      type: "query" as const,
      query,
      database: SAMPLE_DB_ID,
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // Remap Product ID -> Product Title
    await remapProductIdToProductTitle(mb.api);
  });

  for (const fileType of testCases) {
    test(`export should include a column with remapped values for ${fileType} (metabase#18440-1)`, async ({
      page,
    }) => {
      await visitQuestionAdhoc(page, questionDetails);

      await expect(page.getByText("Product ID").first()).toBeVisible();
      await expect(
        page.getByText("Awesome Concrete Shoes").first(),
      ).toBeVisible();

      await downloadAndAssert(page, { fileType });
    });

    test(`export should include a column with remapped values for ${fileType} for a saved question (metabase#18440-2)`, async ({
      page,
      mb,
    }) => {
      const { id } = await createQuestion(mb.api, { query });
      await visitQuestion(page, id);

      await expect(page.getByText("Product ID").first()).toBeVisible();
      await expect(
        page.getByText("Awesome Concrete Shoes").first(),
      ).toBeVisible();

      await downloadAndAssert(page, { fileType, questionId: id });
    });
  }
});

test.describe("issue 18573", () => {
  const questionDetails = {
    dataset_query: {
      type: "query" as const,
      query: { "source-table": ORDERS_ID, limit: 2 },
      database: SAMPLE_DB_ID,
    },
    visualization_settings: {
      column_settings: {
        [`["ref",["field",${ORDERS.PRODUCT_ID},null]]`]: { column_title: "Foo" },
      },
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // Remap Product ID -> Product Title
    await remapProductIdToProductTitle(mb.api);
  });

  test("for the remapped columns, it should preserve renamed column name in exports for xlsx (metabase#18573)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, questionDetails);

    await expect(page.getByText("Foo").first()).toBeVisible();
    await expect(page.getByText("Awesome Concrete Shoes").first()).toBeVisible();

    await downloadAndAssert(page, { fileType: "xlsx" });
  });
});

test.describe("issue 18729", () => {
  const questionDetails = {
    dataset_query: {
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "month-of-year" }],
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ],
        limit: 2,
      },
      type: "query" as const,
    },
    display: "line",
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  for (const fileType of testCases) {
    test(`should properly format the 'X of Y'dates in ${fileType} exports (metabase#18729)`, async ({
      page,
    }) => {
      await visitQuestionAdhoc(page, questionDetails);

      await downloadAndAssert(page, { fileType });
    });
  }
});

test.describe("issue 19889", () => {
  const questionDetails = {
    name: "19889",
    native: {
      query: 'select 1 "column a", 2 "column b", 3 "column c"',
    },
  };

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // loadMetadata: true + wrapId: true — create the question, then visit it so
    // the column headers render for the reorder below.
    const card = await createNativeQuestion(mb.api, questionDetails);
    (page as PageWithQuestionId).questionId = card.id;
    await visitQuestion(page, card.id);

    // Reorder columns a and b.
    await reorderColumnAPastColumnB(page);
  });

  for (const fileType of testCases) {
    test(`should order columns correctly in unsaved native query exports (${fileType})`, async ({
      page,
    }) => {
      await downloadAndAssert(page, { fileType });
    });

    test(`should order columns correctly in saved native query exports (${fileType})`, async ({
      page,
    }) => {
      await saveAndOverwrite(page);

      const questionId = (page as PageWithQuestionId).questionId;
      await downloadAndAssert(page, { fileType, questionId });
    });

    test(`should order columns correctly in saved native query exports when the query was modified but not re-run before save (#19889) (${fileType})`, async ({
      page,
    }) => {
      // H.NativeEditor.focus().type('{selectall}select 1 "column x", ...')
      await openNativeEditor(page);
      await focusNativeEditor(page);
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type(
        'select 1 "column x", 2 "column y", 3 "column c"',
        { delay: 10 },
      );

      await saveAndOverwrite(page);

      const questionId = (page as PageWithQuestionId).questionId;
      await visitQuestion(page, questionId);

      await downloadAndAssert(page, { fileType, questionId });
    });
  }
});

test.describe("metabase#28834", () => {
  const questionDetails = {
    name: "28834",
    native: {
      query: 'select 1 "column a"',
    },
  };

  // I have a test for saved native questions in `QueryBuilder.unit.spec.tsx`.
  // Initially, this test was planned as a unit test, but with some technical
  // difficulties, I've decided to test with Cypress instead.

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const card = await createNativeQuestion(mb.api, questionDetails);
    await visitQuestion(page, card.id);

    await page
      .getByTestId("query-builder-main")
      .getByText("Open Editor", { exact: true })
      .click();
    await typeInNativeEditor(page, ', select 2 "column b"');
  });

  test("should be able to export unsaved native query results as CSV even after the query has changed", async ({
    page,
  }) => {
    await downloadAndAssert(page, { fileType: "csv" });
  });

  test("should be able to export unsaved native query results as XLSX even after the query has changed", async ({
    page,
  }) => {
    await downloadAndAssert(page, { fileType: "xlsx" });
  });
});

// The Cypress original wrapped the created card id (cy.wrap(...).as("questionId"))
// and read it back with cy.get("@questionId"). Playwright has no alias registry,
// so the id is stashed on the page object between beforeEach and the test body.
type PageWithQuestionId = Page & { questionId: number };

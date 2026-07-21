/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-tabular/drillthroughs/column_extract_drill.cy.spec.js
 *
 * The extract-column drill from a table COLUMN HEADER: date-part extraction
 * (Year, [zz] Day of week), and domain/host/path from a URL/email column. After
 * the chosen extraction a new column is appended to the table.
 *
 * Notes:
 * - H.openOrdersTable({ limit }) → openOrdersTable (column-shortcuts.ts, the
 *   limit-aware simple-mode ad-hoc). openPeopleTable is the People equivalent
 *   (column-extract-drill.ts).
 * - The extract-drill option buttons are mixed-content ("Year" + "2026, 2027"
 *   in one element) → matched via case-sensitive substring regex inside
 *   extractColumnAndCheck (PORTING.md mixed-content-text-nodes).
 * - Snowplow helpers (resetSnowplow / expectNoBadSnowplowEvents /
 *   expectUnstructuredSnowplowEvent) run real assertions, backed by the per-slot
 *   collector via ../support/snowplow. The extraction itself still runs.
 */
import { test, expect } from "../support/fixtures";
import {
  extractColumnAndCheck,
  openPeopleTable,
} from "../support/column-extract-drill";
import { openOrdersTable } from "../support/column-shortcuts";
import { createQuestion } from "../support/factories";
import { formatExpression, setModelMetadata } from "../support/custom-column-3";
import {
  enterCustomColumnDetails,
  openNotebook,
  getNotebookStep,
  visualize,
} from "../support/notebook";
import {
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import { tableInteractive } from "../support/models";
import { tableInteractiveBody } from "../support/question-new";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { popover, visitQuestion } from "../support/ui";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

const URL_CASES = [
  {
    option: "Path",
    example: "/en/docs/feature",
  } as { option: string; value?: string; example: string },
];

test.describe("extract action", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await page.setViewportSize({ width: 1600, height: 800 });
  });

  test.describe("date columns", () => {
    test.describe("should add a new column after the selected column", () => {
      test("ad-hoc question", async ({ page }) => {
        await openOrdersTable(page);
        await extractColumnAndCheck(page, {
          column: "Created At",
          option: "Year",
          extraction: "Extract day, month…",
        });
      });

      test("saved question without viz settings", async ({ page }) => {
        await visitQuestion(page, ORDERS_QUESTION_ID);
        await extractColumnAndCheck(page, {
          column: "Created At",
          option: "Year",
          extraction: "Extract day, month…",
        });
      });

      test("saved question with viz settings", async ({ page, mb }) => {
        const { id } = await createQuestion(mb.api, {
          query: {
            "source-table": ORDERS_ID,
            fields: [
              ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
              ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
              ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }],
            ],
          },
          visualization_settings: {
            "table.columns": [
              {
                name: "ID",
                fieldRef: ["field", ORDERS.ID, null],
                enabled: true,
              },
              {
                name: "CREATED_AT",
                fieldRef: [
                  "field",
                  ORDERS.CREATED_AT,
                  {
                    "temporal-unit": "default",
                  },
                ],
                enabled: true,
              },
              {
                name: "QUANTITY",
                fieldRef: ["field", ORDERS.QUANTITY, null],
                enabled: true,
              },
            ],
          },
        });
        await visitQuestion(page, id);
        await extractColumnAndCheck(page, {
          column: "Created At",
          option: "Year",
          extraction: "Extract day, month…",
        });
      });
    });

    test("should be able to modify the expression in the notebook editor", async ({
      page,
    }) => {
      await openOrdersTable(page, { limit: 1 });
      await extractColumnAndCheck(page, {
        column: "Created At",
        option: "Year",
        value: "2,028",
        extraction: "Extract day, month…",
      });
      await openNotebook(page);
      await getNotebookStep(page, "expression")
        .getByText("Year", { exact: true })
        .click();
      await enterCustomColumnDetails(page, {
        formula: "year([Created At]) + 2",
      });
      await formatExpression(page);
      const updateButton = popover(page).getByRole("button", {
        name: "Update",
        exact: true,
      });
      await expect(updateButton).toBeEnabled();
      await updateButton.click();
      await visualize(page);
      await expect(
        page.getByRole("gridcell", { name: "2,030", exact: true }),
      ).toBeVisible();
    });

    test("should use current user locale for string expressions", async ({
      page,
      mb,
    }) => {
      const user = (await (await mb.api.get("/api/user/current")).json()) as {
        id: number;
      };
      await mb.api.put(`/api/user/${user.id}`, { locale: "en-ZZ" });

      await openOrdersTable(page, { limit: 1 });
      await extractColumnAndCheck(page, {
        column: "Created At",
        option: "[zz] Day of week",
        // dayjs has no en-ZZ locale, so it falls back to English day names
        value: "Friday",
        extraction: "[zz] Extract day, month…",
      });
    });
  });

  test.describe("url columns", () => {
    test.beforeEach(async ({ mb }) => {
      // Make the Email column a URL column for these tests, to avoid having to
      // create a new model. (The parent beforeEach already restored + signed
      // in; the Cypress inner restore+signIn is redundant with it.)
      await mb.api.put(`/api/field/${PEOPLE.EMAIL}`, {
        semantic_type: "type/URL",
      });
    });

    for (const { option, value, example } of URL_CASES) {
      test(option, async ({ page }) => {
        await openPeopleTable(page, { limit: 1 });

        await extractColumnAndCheck(page, {
          column: "Email",
          option,
          value,
          example,
          extraction: "Extract domain, subdomain…",
        });
      });
    }

    test("should be able to extract path from URL column", async ({
      page,
      mb,
    }) => {
      async function assertTableData({
        title,
        value,
      }: {
        title: string;
        value: string;
      }) {
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        await expect(
          tableInteractive(page).getByTestId("header-cell").last(),
        ).toHaveText(title);

        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        await expect(
          tableInteractiveBody(page).getByTestId("cell-data").last(),
        ).toHaveText(value);
      }

      const CC_NAME = "URL_URL";
      const { id: modelId } = await createQuestion(mb.api, {
        name: "path from url",
        query: {
          "source-table": PEOPLE_ID,
          limit: 1,
          expressions: {
            [CC_NAME]: [
              "concat",
              "http://",
              ["domain", ["field", PEOPLE.EMAIL, null]],
              ".com/my/path",
            ],
          },
        },
        type: "model",
      });

      // set semantic type to URL
      await setModelMetadata(mb.api, modelId, (field) => {
        if (field.name === CC_NAME) {
          return { ...field, semantic_type: "type/URL" };
        }
        return field;
      });

      // this is the way to open model definition with columns
      await page.goto(`/model/${modelId}/query`);
      await page
        .getByTestId("dataset-edit-bar")
        .getByText("Cancel", { exact: true })
        .click();

      // cy.scrollTo("right") is instant (no duration) → assign scrollLeft
      // directly (PORTING.md scrollTo gotcha).
      await page
        .getByTestId("table-scroll-container")
        .evaluate((el) => {
          el.scrollLeft = el.scrollWidth;
        });

      const urlCase = URL_CASES.find((c) => c.option === "Path")!;
      await extractColumnAndCheck(page, {
        column: CC_NAME,
        option: urlCase.option,
        example: urlCase.example,
        extraction: "Extract domain, subdomain…",
      });

      const extractedValue = "/my/path";
      await assertTableData({
        title: "Path",
        value: extractedValue,
      });
    });
  });
});

test.describe("extract action", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await resetSnowplow(mb);
    await mb.signInAsAdmin();
    await page.setViewportSize({ width: 1600, height: 800 });
  });

  test.afterEach(async ({ mb }) => {
    await expectNoBadSnowplowEvents(mb);
  });

  test("should create a snowplow event for the column extraction action", async ({
    mb,
    page,
  }) => {
    await openOrdersTable(page, { limit: 1 });

    await extractColumnAndCheck(page, {
      column: "Created At",
      option: "Year",
      value: "2,028",
      extraction: "Extract day, month…",
    });

    await expectUnstructuredSnowplowEvent(mb, {
      event: "column_extract_via_column_header",
      custom_expressions_used: ["get-year"],
      database_id: SAMPLE_DB_ID,
    });
  });
});

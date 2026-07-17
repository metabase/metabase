/**
 * Playwright port of e2e/test/scenarios/question/settings.cy.spec.js
 *
 * Notes:
 * - The dnd-kit column drags (moveDnDKitElementByAlias with useMouseEvents)
 *   are real-mouse drags here via moveDnDKitElement.
 * - The "post-aggregation custom column" test is @skip-tagged upstream in
 *   Cypress and stays skipped here.
 */
import type { Page, Response } from "@playwright/test";

import { openVizSettingsSidebar } from "../support/charts";
import { icon, inputWithValue, moveDnDKitElement } from "../support/dashboard-cards";
import { pickEntity, sidebar } from "../support/dashboard";
import { createNativeQuestion } from "../support/dashboard-management";
import { test, expect } from "../support/fixtures";
import { modal, tableInteractive } from "../support/models";
import { entityPickerModal, tableHeaderClick } from "../support/notebook";
import { visitQuestionAdhoc } from "../support/permissions";
import { checkSavedToCollectionQuestionToast } from "../support/question-new";
import {
  browseDatabases,
  findColumnAtIndex,
  getSidebarColumns,
  getVisibleSidebarColumns,
  hideColumn,
  moveDnDKitElementSynthetic,
  openOrdersTable,
} from "../support/question-settings";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  openNavigationSidebar,
  popover,
  queryBuilderHeader,
  visitQuestion,
} from "../support/ui";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

function waitForDataset(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

async function refreshResultsInHeader(page: Page) {
  const dataset = waitForDataset(page);
  await queryBuilderHeader(page)
    .getByRole("button", { name: "Refresh", exact: true })
    .click();
  await dataset;
}

test.describe("scenarios > question > settings", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("column settings", () => {
    test("should allow you to remove a column and add two foreign columns", async ({
      page,
    }) => {
      // oddly specific test inspired by https://github.com/metabase/metabase/issues/11499

      // get a really wide window, so we don't need to mess with scrolling the table horizontally
      await page.setViewportSize({ width: 1600, height: 800 });

      await openOrdersTable(page);
      await openVizSettingsSidebar(page);

      // wait for settings sidebar to open
      await expect
        .poll(async () => {
          const box = await page.getByTestId("sidebar-left").boundingBox();
          return box?.width ?? 0;
        })
        .toBeGreaterThan(350);

      const tableOptions = page.getByTestId("sidebar-content");

      await page
        .getByRole("button", { name: "Add or remove columns", exact: true })
        .click();

      // remove Total column (Mantine checkbox input — its icon overlay
      // swallows the hit-target check, hence force)
      const totalColumn = tableOptions.getByLabel("Total", { exact: true });
      await expect(totalColumn).toBeChecked();
      await totalColumn.click({ force: true });

      // Add people.category
      const categoryColumn = tableOptions.getByLabel("Category", {
        exact: true,
      });
      await expect(categoryColumn).not.toBeChecked();
      await categoryColumn.click({ force: true });

      // wait a Category value to appear in the table, so we know the query completed
      await expect(
        page.getByTestId("visualization-root").getByText(/Widget/).first(),
      ).toBeVisible();

      // Add people.ean
      const eanColumn = tableOptions.getByLabel("Ean", { exact: true });
      await expect(eanColumn).not.toBeChecked();
      await eanColumn.click({ force: true });

      // wait a Ean value to appear in the table, so we know the query completed
      await expect(
        page
          .getByTestId("visualization-root")
          .getByText(/8833419218504/)
          .first(),
      ).toBeVisible();

      // confirm that the table contains the right columns
      const table = tableInteractive(page);
      await expect(table.getByText(/Product → Category/).first()).toBeVisible();
      await expect(table.getByText(/Product → Ean/).first()).toBeVisible();
      // case-sensitive /Total/ doesn't match "Subtotal", mirroring cy.contains
      await expect(table.getByText(/Total/)).toHaveCount(0);
    });

    test("should allow you to re-order columns even when one has been removed (metabase #14238, #29287)", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1600, height: 800 });

      await visitQuestionAdhoc(page, {
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            joins: [
              {
                fields: "all",
                alias: "Products",
                "source-table": PRODUCTS_ID,
                strategy: "left-join",
                condition: [
                  "=",
                  ["field", ORDERS.PRODUCT_ID, {}],
                  ["field", PRODUCTS.ID, { "join-alias": "Products" }],
                ],
              },
            ],
          },
          type: "query",
        },
      });
      await openVizSettingsSidebar(page);

      await page.getByTestId("Subtotal-hide-button").click();
      await page.getByTestId("Tax-hide-button").click();

      const sidebarColumns = await getSidebarColumns(page);
      const total = sidebarColumns.nth(5);
      await expect(total).toContainText("Total");

      await moveDnDKitElement(total, { vertical: -100 });

      await expect(sidebarColumns.nth(3)).toContainText("Total");

      const title = getVisibleSidebarColumns(page).nth(11);
      await expect(title).toHaveText("Products → Title");

      const listContainer = page.getByTestId("chartsettings-list-container");
      await listContainer.evaluate((el) => el.scrollTo(0, 0));
      await expect
        .poll(() => listContainer.evaluate((el) => el.scrollTop))
        .toBe(0);

      // The title row sits below the list container's fold, so a real mouse
      // press would land on clipped coordinates — synthetic events, like the
      // Cypress original.
      await moveDnDKitElementSynthetic(title, { vertical: 15 });

      await expect
        .poll(() => listContainer.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0);
    });

    test("should preserve correct order of columns after column removal via sidebar (metabase#13455)", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 2000, height: 1600 });
      // Orders join Products
      await visitQuestionAdhoc(page, {
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            joins: [
              {
                fields: "all",
                "source-table": PRODUCTS_ID,
                condition: [
                  "=",
                  [
                    "field",
                    ORDERS.PRODUCT_ID,
                    {
                      "base-type": "type/Integer",
                    },
                  ],
                  [
                    "field",
                    PRODUCTS.ID,
                    {
                      "base-type": "type/BigInteger",
                      "join-alias": "Products",
                    },
                  ],
                ],
                alias: "Products",
              },
            ],
            limit: 5,
          },
          database: SAMPLE_DB_ID,
        },
        display: "table",
      });

      await openVizSettingsSidebar(page);

      const sidebarColumns = await getSidebarColumns(page);
      const prodCategory = sidebarColumns.nth(12);
      await expect(prodCategory).toContainText(/Products? → Category/);

      // Drag and drop this column between "Tax" and "Discount" (index 5 in the sidebar columns array)
      await moveDnDKitElement(prodCategory, { vertical: -360 });

      await refreshResultsInHeader(page);

      await findColumnAtIndex(page, "Products → Category", 5);

      // Let the refreshed results finish rendering (Total visible) before hiding,
      // so the hide toggle doesn't race the in-flight results render.
      await expect(
        page.getByTestId("query-builder-main").getByText("117.03", {
          exact: true,
        }),
      ).toBeVisible();

      // Remove "Total"
      await hideColumn(page, "Total");

      await expect(
        page.getByTestId("query-builder-main").getByText("117.03", {
          exact: true,
        }),
      ).toHaveCount(0);

      await findColumnAtIndex(page, "Products → Category", 5);

      // We need to do some additional checks. Please see:
      // https://github.com/metabase/metabase/pull/21338#pullrequestreview-928807257

      // Add "Address"
      await page
        .getByRole("button", { name: "Add or remove columns", exact: true })
        .click();
      const addressColumn = page.getByLabel("Address", { exact: true });
      await expect(addressColumn).not.toBeChecked();
      const dataset = waitForDataset(page);
      await addressColumn.click({ force: true });
      await dataset;

      await page
        .getByRole("button", { name: "Done picking columns", exact: true })
        .click();

      const userAddress = await findColumnAtIndex(page, "User → Address", -1);

      // Move it one place up
      await moveDnDKitElement(userAddress, { vertical: -100 });

      await findColumnAtIndex(page, "User → Address", -3);
    });

    test("should be okay showing an empty joined table (metabase#29140)", async ({
      page,
    }) => {
      // Orders join Products
      await visitQuestionAdhoc(page, {
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            fields: [
              ["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }],
              ["field", ORDERS.SUBTOTAL, { "base-type": "type/Float" }],
            ],
            limit: 5,
          },
          database: SAMPLE_DB_ID,
        },
        display: "table",
      });

      await openVizSettingsSidebar(page);

      await page
        .getByRole("button", { name: "Add or remove columns", exact: true })
        .click();
      const nameColumn = page.getByLabel("Name", { exact: true });
      await expect(nameColumn).not.toBeChecked();
      await nameColumn.click({ force: true });
      await page
        .getByRole("button", { name: "Done picking columns", exact: true })
        .click();

      // Remove "Product ID"
      await hideColumn(page, "Product ID");

      // Remove "Subtotal"
      await hideColumn(page, "Subtotal");

      // Remove "Name"
      await hideColumn(page, "User → Name");

      await expect(
        page
          .getByTestId("query-builder-main")
          .getByText("Every field is hidden right now", { exact: true }),
      ).toBeVisible();
    });

    test("should change to column formatting when sidebar is already open (metabase#16043)", async ({
      page,
    }) => {
      await visitQuestionAdhoc(page, {
        dataset_query: {
          type: "query",
          query: { "source-table": ORDERS_ID },
          database: SAMPLE_DB_ID,
        },
      });

      await openVizSettingsSidebar(page); // open settings sidebar
      await expect(
        page.getByText("Conditional Formatting", { exact: true }),
      ).toBeVisible(); // confirm it's open

      await tableHeaderClick(page, "Subtotal"); // open subtotal column header actions

      await icon(popover(page), "gear").click(); // open subtotal column settings

      await expect(
        page.getByText("Separator style", { exact: true }),
      ).toBeVisible(); // shows subtotal column settings

      await page
        .getByTestId("head-crumbs-container")
        .getByText("Orders", { exact: true })
        .click(); // Dismiss popover

      await tableHeaderClick(page, "Created At"); // open created_at column header actions

      await icon(popover(page), "gear").click(); // open created_at column settings

      await expect(
        page.getByText("Date style", { exact: true }),
      ).toBeVisible(); // shows created_at column settings
    });

    test("should respect renamed column names in the settings sidebar (metabase#18476)", async ({
      page,
    }) => {
      const newColumnTitle = "Pre-tax";

      const questionDetails = {
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: { "source-table": ORDERS_ID },
          type: "query" as const,
        },
        display: "table",
        visualization_settings: {
          column_settings: {
            [`["ref",["field",${ORDERS.SUBTOTAL},null]]`]: {
              column_title: newColumnTitle,
            },
          },
        },
      };

      await visitQuestionAdhoc(page, questionDetails);

      await expect(
        page.getByText(newColumnTitle, { exact: true }),
      ).toBeVisible();

      await openVizSettingsSidebar(page);

      await expect(
        sidebar(page).getByText(newColumnTitle, { exact: true }),
      ).toBeVisible();
    });

    test("should respect symbol settings for all currencies", async ({
      page,
    }) => {
      await openOrdersTable(page);
      await openVizSettingsSidebar(page);

      const sidebarColumns = await getSidebarColumns(page);
      const taxColumn = sidebarColumns.nth(4);
      await taxColumn.hover();
      await icon(taxColumn, "ellipsis").click({ force: true });

      const settingsPopover = popover(page).first();
      await (await inputWithValue(settingsPopover, "Normal")).click();
      await page.getByText("Currency", { exact: true }).click();

      await (await inputWithValue(settingsPopover, "US Dollar")).click();
      await page.getByText("Bitcoin", { exact: true }).click();

      await page.getByText("In every table cell", { exact: true }).click();

      await expect(page.getByText("₿ 2.07", { exact: true })).toBeVisible();
      await expect(page.getByText("₿ 6.10", { exact: true })).toBeVisible();
    });

    test("should show all options without text overflowing", async ({
      page,
      mb,
    }) => {
      const longName =
        "SuperLongColumnNameSuperLongColumnNameSuperLongColumnNameSuperLongColumnNameSuperLongColumnName";
      const { id } = await createNativeQuestion(mb.api, {
        name: "Orders Model",
        native: {
          query: `SELECT total as "${longName}" FROM ORDERS`,
        },
      });
      await visitQuestion(page, id);

      await openVizSettingsSidebar(page);

      const columnRow = sidebar(page).getByRole("listitem");
      await expect(
        columnRow.getByLabel("ellipsis icon", { exact: true }),
      ).toBeVisible();
      await expect(
        columnRow.getByLabel("eye_outline icon", { exact: true }),
      ).toBeVisible();
      await expect(
        columnRow.getByText(longName, { exact: true }),
      ).toBeVisible();
    });

    test("should show all series settings without text overflowing (metabase#52975)", async ({
      page,
      mb,
    }) => {
      const regularColumnName = "regular column";
      const longColumnName1 =
        "very very very very very very very very very very very long column 1";
      const longColumnName2 =
        "very very very very very very very very very very very long column 2";

      const { id } = await createNativeQuestion(mb.api, {
        name: "52975",
        native: {
          query: `select 'foo' x, 10 "${regularColumnName}", 20 "${longColumnName1}", 20 "${longColumnName2}"`,
        },
        display: "bar",
      });
      await visitQuestion(page, id);

      await openVizSettingsSidebar(page);

      const fieldPickers = sidebar(page).getByTestId(
        "chartsettings-field-picker",
      );

      const fourthPicker = fieldPickers.nth(3);
      await expect(
        fourthPicker.getByTestId("color-selector-button"),
      ).toBeVisible();
      await expect(
        fourthPicker.getByLabel("chevrondown icon", { exact: true }),
      ).toHaveCount(0);
      await expect(
        fourthPicker.getByLabel("ellipsis icon", { exact: true }),
      ).toBeVisible();
      await expect(
        fourthPicker.getByLabel("grabber icon", { exact: true }),
      ).toBeVisible();
      // Cypress cy.get("input").should("have.value") asserts the first match
      await expect(fourthPicker.locator("input").first()).toHaveValue(
        longColumnName2,
      );
      await expect(
        fourthPicker.getByLabel("close icon", { exact: true }),
      ).toBeVisible();
      await fourthPicker.getByTestId(`remove-${longColumnName2}`).click();

      const thirdPicker = fieldPickers.nth(2);
      await expect(
        thirdPicker.getByTestId("color-selector-button"),
      ).toBeVisible();
      await expect(
        thirdPicker.getByLabel("chevrondown icon", { exact: true }),
      ).toBeVisible();
      await expect(
        thirdPicker.getByLabel("ellipsis icon", { exact: true }),
      ).toBeVisible();
      await expect(
        thirdPicker.getByLabel("grabber icon", { exact: true }),
      ).toBeVisible();
      await expect(thirdPicker.locator("input").first()).toHaveValue(
        longColumnName1,
      );
      await expect(
        thirdPicker.getByLabel("close icon", { exact: true }),
      ).toBeVisible();
      await thirdPicker.getByTestId(`remove-${longColumnName1}`).click();

      const secondPicker = fieldPickers.nth(1);
      await expect(
        secondPicker.getByTestId("color-selector-button"),
      ).toBeVisible();
      await expect(
        secondPicker.getByLabel("chevrondown icon", { exact: true }),
      ).toBeVisible();
      await expect(
        secondPicker.getByLabel("ellipsis icon", { exact: true }),
      ).toBeVisible();
      await expect(
        secondPicker.getByLabel("grabber icon", { exact: true }),
      ).toHaveCount(0);
      await expect(secondPicker.locator("input").first()).toHaveValue(
        regularColumnName,
      );
      await expect(
        secondPicker.getByLabel("close icon", { exact: true }),
      ).toHaveCount(0);
    });

    test("should allow hiding and showing aggregated columns with a post-aggregation custom column (metabase#22563)", async ({
      page,
      mb,
    }) => {
      test.skip(true, "@skip upstream in Cypress");

      // products joined to orders with breakouts on 3 product columns followed by a custom column
      const { id } = await mb.api.createQuestion({
        name: "repro 22563",
        query: {
          "source-query": {
            "source-table": ORDERS_ID,
            joins: [
              {
                alias: "Products",
                condition: [
                  "=",
                  ["field", ORDERS.PRODUCT_ID, null],
                  ["field", PRODUCTS.ID, { "join-alias": "Products" }],
                ],
                "source-table": PRODUCTS_ID,
              },
            ],
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                PRODUCTS.CATEGORY,
                { "base-type": "type/Text", "join-alias": "Products" },
              ],
              [
                "field",
                PRODUCTS.TITLE,
                { "base-type": "type/Text", "join-alias": "Products" },
              ],
              [
                "field",
                PRODUCTS.VENDOR,
                { "base-type": "type/Text", "join-alias": "Products" },
              ],
            ],
          },
          expressions: {
            two: ["+", 1, 1],
          },
        },
      });
      await visitQuestion(page, id);

      const columnNames = [
        "Products → Category",
        "Products → Title",
        "Products → Vendor",
        "Count",
        "two",
      ];

      const table = tableInteractive(page);
      for (const text of columnNames) {
        await expect(table.getByText(text, { exact: true })).toBeVisible();
      }

      await openVizSettingsSidebar(page);

      const settingsSidebar = page.getByTestId("chartsettings-sidebar");
      for (const text of columnNames) {
        await expect(
          settingsSidebar.getByText(text, { exact: true }),
        ).toBeVisible();
      }
      await expect(
        settingsSidebar.getByText("More Columns", { exact: true }),
      ).toHaveCount(0);

      await icon(settingsSidebar, "eye_outline").first().click();

      await expect(
        settingsSidebar.getByText("More columns", { exact: true }),
      ).toBeVisible();

      // disable the first column
      await expect(
        settingsSidebar
          .getByTestId("disabled-columns")
          .getByText("Products → Category", { exact: true }),
      ).toBeVisible();
      await expect(
        settingsSidebar
          .getByTestId("visible-columns")
          .getByText("Products → Category", { exact: true }),
      ).toHaveCount(0);

      // the query should not have changed
      await expect(icon(table, "play")).toHaveCount(0);
      await expect(
        table.getByText("Products → Category", { exact: true }),
      ).toHaveCount(0);

      await icon(settingsSidebar, "add").click();
      // re-enable the first column
      await expect(
        settingsSidebar.getByText("More columns", { exact: true }),
      ).toHaveCount(0);
      await expect(
        settingsSidebar
          .getByTestId("visible-columns")
          .getByText("Products → Category", { exact: true }),
      ).toBeVisible();

      // the query should not have changed
      await expect(icon(table, "play")).toHaveCount(0);
      await expect(
        table.getByText("Products → Category", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("resetting state", () => {
    test("should reset modal state when navigating away", async ({ page }) => {
      // create a question and add it to a modal
      await openOrdersTable(page);

      await queryBuilderHeader(page)
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await page
        .getByTestId("save-question-modal")
        .getByLabel(/Where do you want to save this/)
        .click();
      await pickEntity(page, { path: ["Our analytics"], select: false });
      await entityPickerModal(page)
        .getByText("Select this collection", { exact: true })
        .click();
      await page
        .getByTestId("save-question-modal")
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await checkSavedToCollectionQuestionToast(page, true);

      const picker = entityPickerModal(page);
      await picker.getByText("Our analytics", { exact: true }).click();
      await picker.getByText("Orders in a dashboard", { exact: true }).click();
      await picker.getByText("Cancel", { exact: true }).click();

      // create a new question to see if the "add to a dashboard" modal is still there
      await openNavigationSidebar(page);
      await browseDatabases(page).click();

      await page.getByText(/Sample Database/).first().click();
      await page.getByText(/Orders/).first().click();

      // This next assertion might not catch bugs where the modal displays after
      // a quick delay. With the previous presentation of this bug, the modal
      // was immediately visible, so I'm not going to add any waits.
      await expect(modal(page)).toHaveCount(0);
    });
  });
});

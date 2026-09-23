/**
 * Playwright port of
 * e2e/test/scenarios/native-filters/sql-field-filter.cy.spec.js
 *
 * Porting notes:
 * - The Cypress beforeEach registers cy.intercept("POST", "api/dataset")
 *   .as("dataset") once; only SQLFilter.runQuery ever waits on it, so the
 *   wait lives inside runQuery here.
 * - "missing field" used enterParameterizedQuery(..., { allowFastSet: true })
 *   — a workaround for cy.type being slow/broken on CodeMirror. Playwright's
 *   keyboard input types the query directly.
 * - The Cypress `context("Category")` block is a `describe` here (Playwright
 *   has no context alias).
 */
import type { Page } from "@playwright/test";

import { filterWidget } from "../support/dashboard";
import { icon } from "../support/dashboard-cards";
import { test, expect } from "../support/fixtures";
import { tooltip } from "../support/charts";
import { tableInteractive } from "../support/models";
import {
  startNewNativeQuestion,
  typeInNativeEditor,
} from "../support/native-editor";
import {
  chooseType,
  clearFilterWidget,
  fieldValuesCombobox,
  getRunQueryButton,
  getSaveQueryButton,
  mapFieldFilterTo,
  multiAutocompleteInput,
  openTypePickerFromDefaultFilterType,
  removeFieldValuesValue,
  runQuery,
  setFieldAlias,
  toggleRequired,
} from "../support/native-filters";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { createNativeQuestion } from "../support/sharing";
import { popover, visitQuestion } from "../support/ui";

const { PRODUCTS } = SAMPLE_DATABASE;

test.describe("scenarios > filters > sql filters > field filter", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("required tag", () => {
    test.beforeEach(async ({ page }) => {
      await startNewNativeQuestion(page);
      await typeInNativeEditor(
        page,
        "SELECT * FROM products WHERE {{filter}}",
      );

      await openTypePickerFromDefaultFilterType(page);
      await chooseType(page, "Field Filter");

      await mapFieldFilterTo(page, {
        table: "Products",
        field: "ID",
      });

      const widgetTypeSelect = page.getByTestId("filter-widget-type-select");
      await expect(widgetTypeSelect).toHaveValue("ID");
      await expect(widgetTypeSelect).toBeDisabled();
    });

    async function setDefaultFieldValue(page: Page, value: string) {
      await page
        .getByTestId("sidebar-content")
        .getByText("Enter a default value…", { exact: true })
        .click();
      const dropdown = popover(page);
      await dropdown
        .getByPlaceholder("Enter a default value…", { exact: true })
        .pressSequentially(value);
      await dropdown
        .getByRole("button", { name: "Add filter", exact: true })
        .click();
    }

    test("does not need a default value to run and save the query", async ({
      page,
    }) => {
      await toggleRequired(page);
      await expect(getRunQueryButton(page)).toBeEnabled();
      await expect(getSaveQueryButton(page)).not.toHaveAttribute("disabled");
    });

    test("when there's a default value, enabling required sets it as a parameter value", async ({
      page,
    }) => {
      await setDefaultFieldValue(page, "5");
      await filterWidget(page).click();
      await clearFilterWidget(page);
      await toggleRequired(page);
      await expect(filterWidget(page)).toContainText("5");
    });

    test("when there's a default value and value is unset, updating filter sets the default back", async ({
      page,
    }) => {
      await setDefaultFieldValue(page, "10");
      await toggleRequired(page);
      await filterWidget(page).click();

      const dropdown = popover(page);
      await removeFieldValuesValue(dropdown, 0);
      await dropdown.getByText("Set to default", { exact: true }).click();

      // make sure the dialog is gone
      await expect(page.getByRole("dialog")).toHaveCount(0);

      await expect(filterWidget(page)).toContainText("10");
    });

    test("when there's a default value and template tag is required, can reset it back", async ({
      page,
    }) => {
      await setDefaultFieldValue(page, "8");
      await toggleRequired(page);
      await filterWidget(page).click();

      const dropdown = popover(page);
      await fieldValuesCombobox(dropdown).pressSequentially("10,");
      await dropdown.getByText("Update filter", { exact: true }).click();

      await icon(filterWidget(page), "revert").click();
      await expect(filterWidget(page)).toContainText("8");
    });
  });

  // Deprecated field filter types
  test.describe("Category", () => {
    const questionDetails = {
      name: "Products SQL",
      native: {
        query: "select * from products where {{category}}",
        "template-tags": {
          category: {
            "display-name": "Field Filter",
            id: "abc123",
            name: "category",
            type: "dimension",
            // This is the old syntax that should automatically work in newer versions!
            // It should convert to a new syntax ("widget-type": "string/=") when we run the query.
            "widget-type": "category",
            dimension: ["field", PRODUCTS.CATEGORY, null],
            default: ["Doohickey"],
          },
        },
      },
      display: "table",
    };

    test("should work despite it not showing up in the widget type list", async ({
      page,
      mb,
    }) => {
      const { id } = await createNativeQuestion(mb.api, questionDetails);
      await visitQuestion(page, id);
      await expect(
        page.getByText("Showing 42 rows", { exact: true }),
      ).toBeVisible();

      await clearFilterWidget(page);
      await filterWidget(page).click();

      const dropdown = popover(page);
      await dropdown.getByText("Gizmo", { exact: true }).click();
      await dropdown
        .getByRole("button", { name: "Update filter", exact: true })
        .click();

      await icon(page.getByTestId("qb-header"), "play").click();
      await expect(
        page.getByText("Showing 51 rows", { exact: true }),
      ).toBeVisible();

      await page.getByText("Open Editor", { exact: true }).click();
      await icon(page, "variable").click();

      await page
        .getByText("Filter widget type", { exact: true })
        .locator("..")
        .getByTestId("filter-widget-type-select")
        .click();

      // cy.contains("String") = case-sensitive substring, first match
      await expect(popover(page).getByText(/String/).first()).toBeVisible();
    });
  });

  test.describe("field alias", () => {
    test("should be able to use a field alias with a field filter", async ({
      page,
    }) => {
      await startNewNativeQuestion(page);
      await typeInNativeEditor(
        page,
        "select * from (select id as alias from products) as p where {{filter}}",
      );
      await openTypePickerFromDefaultFilterType(page);
      await chooseType(page, "Field Filter");
      await mapFieldFilterTo(page, {
        table: "Products",
        field: "ID",
      });
      await setFieldAlias(page, "p.alias");
      await filterWidget(page).click();

      const dropdown = popover(page);
      await multiAutocompleteInput(dropdown).pressSequentially("10,20");
      await dropdown
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      await runQuery(page);
      await expect(tableInteractive(page)).toContainText("10");
      await expect(tableInteractive(page)).toContainText("20");
    });

    test("should be able to use a field alias with a time grouping", async ({
      page,
    }) => {
      await startNewNativeQuestion(page);
      await typeInNativeEditor(
        page,
        "select count(*), {{date}} as date from products as p group by date",
      );
      await openTypePickerFromDefaultFilterType(page);
      await chooseType(page, "Time grouping");
      await mapFieldFilterTo(page, {
        table: "Products",
        field: "Created At",
      });
      await setFieldAlias(page, "p.created_at");
      await filterWidget(page).click();
      await popover(page).getByText("Month", { exact: true }).click();
      await runQuery(page);
      await expect(tableInteractive(page)).toContainText("April 1, 2025");
    });
  });

  test.describe("missing field", () => {
    test("should show error message when the field mapping is missing", async ({
      page,
    }) => {
      // Set up field filter
      await startNewNativeQuestion(page);
      await typeInNativeEditor(
        page,
        "SELECT * FROM products WHERE {{my_filter}}",
      );

      // Test field filter
      await openTypePickerFromDefaultFilterType(page);
      await chooseType(page, "Field Filter");

      await expect(getSaveQueryButton(page)).toHaveAttribute("aria-disabled");
      await getSaveQueryButton(page).click({ force: true });
      // Both the save and run buttons can have this tooltip mounted at once
      // — strict mode needs first-match here.
      await expect(
        tooltip(page)
          .getByText('The variable "my_filter" needs to be mapped to a field.', {
            exact: true,
          })
          .first(),
      ).toBeVisible();

      await expect(getRunQueryButton(page)).toBeDisabled();
      await getRunQueryButton(page).click({ force: true });
      // Both the save and run buttons can have this tooltip mounted at once
      // — strict mode needs first-match here.
      await expect(
        tooltip(page)
          .getByText('The variable "my_filter" needs to be mapped to a field.', {
            exact: true,
          })
          .first(),
      ).toBeVisible();

      // Test time grouping
      await openTypePickerFromDefaultFilterType(page);
      await chooseType(page, "Time grouping");

      await expect(getSaveQueryButton(page)).toHaveAttribute("aria-disabled");
      await getSaveQueryButton(page).click({ force: true });
      // Both the save and run buttons can have this tooltip mounted at once
      // — strict mode needs first-match here.
      await expect(
        tooltip(page)
          .getByText('The variable "my_filter" needs to be mapped to a field.', {
            exact: true,
          })
          .first(),
      ).toBeVisible();

      await expect(getRunQueryButton(page)).toBeDisabled();
      await getRunQueryButton(page).click({ force: true });
      // Both the save and run buttons can have this tooltip mounted at once
      // — strict mode needs first-match here.
      await expect(
        tooltip(page)
          .getByText('The variable "my_filter" needs to be mapped to a field.', {
            exact: true,
          })
          .first(),
      ).toBeVisible();
    });
  });
});

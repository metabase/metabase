/**
 * Playwright port of
 * e2e/test/scenarios/native-filters/sql-filters-source.cy.spec.js
 *
 * A SQL template-tag filter whose dropdown values come from a configurable
 * source: a connected field, a custom list, or another card/model.
 *
 * Porting notes:
 * - The Cypress beforeEach registers six cy.intercept aliases; only the ones
 *   actually waited on are ported, and each as a waitForResponse registered at
 *   the true trigger (never in beforeEach). @sessionProperties / @dataset (the
 *   describe-level one) are never awaited → dropped.
 * - SQLFilter.runQuery("cardQuery"|"dataset") → runQuery, which waits on the
 *   exact endpoint the alias named (POST /api/card/:id/query vs /api/dataset).
 * - cy.get("@parameterValues.all").should("have.length", 1) → a countRequests
 *   counter registered at the top of the test (it must see every request).
 * - H.setFilterListSource / H.setFilterQuestionSource are the two values-source
 *   helpers dashboard.ts already ports; the rest live in sql-filters-source.ts.
 */
import {
  filterWidget,
  setFilterListSource,
  setFilterQuestionSource,
} from "../support/dashboard";
import { countRequests } from "../support/dashboard-parameters";
import { createNativeQuestion, createQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import {
  startNewNativeQuestion,
  typeInNativeEditor,
} from "../support/native-editor";
import {
  chooseType,
  fieldValuesCombobox,
  mapFieldFilterTo,
  multiAutocompleteInput,
  openTypePickerFromDefaultFilterType,
  toggleRequired,
} from "../support/native-filters";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { saveQuestion } from "../support/sharing";
import {
  checkFilterListSourceHasValue,
  checkFilterValueInList,
  checkFilterValueNotInList,
  closeEntryForm,
  dashboardParametersPopover,
  fieldValuesValue,
  multiAutocompleteValue,
  openEntryForm,
  runQuery,
  selectFilterValueFromList,
  setConnectedFieldSource,
  setDropdownFilterType,
  setSearchBoxFilterType,
  setWidgetType,
  updateQuestion,
} from "../support/sql-filters-source";
import { popover } from "../support/ui";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const structuredSourceQuestion = {
  name: "MBQL source",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
    filter: ["!=", ["field", PRODUCTS.CATEGORY, null], "Doohickey"],
  },
};

const nativeSourceQuestion = {
  name: "SQL source",
  native: {
    query: "SELECT '1018947080336' EAN UNION ALL SELECT '7663515285824'",
  },
};

const isParameterValues = (method: string, pathname: string) =>
  method === "POST" && pathname === "/api/dataset/parameter/values";

const isCardParameterValues = (method: string, pathname: string) =>
  method === "GET" && /^\/api\/card\/\d+\/params\/[^/]+\/values$/.test(pathname);

test.describe("scenarios > filters > sql filters > values source", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.updateSetting("enable-public-sharing", true);
  });

  test.describe("structured question source", () => {
    test("should be able to use a structured question source", async ({
      page,
      mb,
    }) => {
      await createQuestion(mb.api, structuredSourceQuestion);

      await startNewNativeQuestion(page);
      await typeInNativeEditor(page, "SELECT * FROM PRODUCTS WHERE {{tag}}");
      await openTypePickerFromDefaultFilterType(page);
      await chooseType(page, "Field Filter");
      await mapFieldFilterTo(page, { table: "Products", field: "Category" });
      await setFilterQuestionSource(page, {
        question: "MBQL source",
        field: "Category",
      });
      await saveQuestion(page, "SQL filter", { path: ["Our analytics"] });

      await openEntryForm(page);
      await checkFilterValueNotInList(page, "Doohickey");
      await selectFilterValueFromList(page, "Gizmo");
      await runQuery(page, "cardQuery");

      await toggleRequired(page);
      await openEntryForm(page, true);
      await selectFilterValueFromList(page, "Gadget", {
        buttonLabel: "Update filter",
      });
    });

    test("should be able to use a structured question source with a text tag", async ({
      page,
      mb,
    }) => {
      await createQuestion(mb.api, structuredSourceQuestion);

      await startNewNativeQuestion(page);
      await typeInNativeEditor(
        page,
        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{tag}}",
      );
      await setDropdownFilterType(page);
      await setFilterQuestionSource(page, {
        question: "MBQL source",
        field: "Category",
      });
      await saveQuestion(page, "SQL filter", { path: ["Our analytics"] });

      await openEntryForm(page);
      await checkFilterValueNotInList(page, "Doohickey");
      await selectFilterValueFromList(page, "Gadget", { addFilter: false });
      await selectFilterValueFromList(page, "Gizmo");
      await runQuery(page, "cardQuery");
      await expect(page.getByText("Showing 51 rows", { exact: true })).toBeVisible();

      await toggleRequired(page);
      await page
        .getByTestId("sidebar-content")
        .getByText("Enter a default value…", { exact: true })
        .click();

      await popover(page).getByText("Gadget", { exact: true }).click();
      await popover(page)
        .getByRole("button", { name: "Update filter", exact: true })
        .click();
    });

    test("should be able to use a structured question source without saving the question", async ({
      page,
      mb,
    }) => {
      await createQuestion(mb.api, structuredSourceQuestion);

      await startNewNativeQuestion(page);
      await typeInNativeEditor(
        page,
        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{tag}}",
      );
      await setDropdownFilterType(page);
      await setFilterQuestionSource(page, {
        question: "MBQL source",
        field: "Category",
      });

      await openEntryForm(page);
      await checkFilterValueNotInList(page, "Doohickey");
      await selectFilterValueFromList(page, "Gizmo");
      await runQuery(page, "dataset");
    });

    test("should properly cache parameter values api calls", async ({
      page,
      mb,
    }) => {
      const parameterValues = countRequests(page, isParameterValues);
      const cardParameterValues = countRequests(page, isCardParameterValues);

      await createQuestion(mb.api, structuredSourceQuestion);
      await startNewNativeQuestion(page);
      await typeInNativeEditor(
        page,
        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{tag}}",
      );

      await setDropdownFilterType(page);
      await setFilterQuestionSource(page, {
        question: "MBQL source",
        field: "Category",
      });

      // The Cypress `cy.wait("@parameterValues")` gates were satisfied
      // retroactively — the values fetch can fire while configuring the source,
      // before the dropdown is opened, and cy.wait consumes past responses. A
      // future-only waitForResponse would time out. checkFilterValueInList
      // already waits for the values to render (i.e. the fetch resolved); the
      // counters (registered at the top) capture every request for the
      // exact-count assertions.
      await openEntryForm(page);
      await checkFilterValueInList(page, "Gizmo");
      await closeEntryForm(page);
      await openEntryForm(page);
      await checkFilterValueInList(page, "Gizmo");
      expect(parameterValues.count()).toBe(1);

      await setFilterListSource(page, { values: ["A", "B"] });
      await openEntryForm(page);
      await checkFilterValueInList(page, "A");

      await saveQuestion(page, "SQL filter", { path: ["Our analytics"] });

      await openEntryForm(page);
      await checkFilterValueInList(page, "A");
      await closeEntryForm(page);
      await openEntryForm(page);
      await checkFilterValueInList(page, "A");
      expect(cardParameterValues.count()).toBe(1);

      await setFilterQuestionSource(page, {
        question: "MBQL source",
        field: "Category",
      });
      await updateQuestion(page);
      await openEntryForm(page);
      await checkFilterValueInList(page, "Gizmo");
    });
  });

  test.describe("native question source", () => {
    test("should be able to use a native question source in the query builder", async ({
      page,
      mb,
    }) => {
      await createNativeQuestion(mb.api, nativeSourceQuestion);

      await startNewNativeQuestion(page);
      await typeInNativeEditor(page, "SELECT * FROM PRODUCTS WHERE {{tag}}");
      await openTypePickerFromDefaultFilterType(page);
      await chooseType(page, "Field Filter");
      await mapFieldFilterTo(page, { table: "Products", field: "Ean" });
      await setWidgetType(page, "String");
      await setFilterQuestionSource(page, {
        question: "SQL source",
        field: "EAN",
      });
      await saveQuestion(page, "SQL filter", { path: ["Our analytics"] });

      await openEntryForm(page);
      await checkFilterValueNotInList(page, "0001664425970");
      await selectFilterValueFromList(page, "1018947080336");
      await runQuery(page, "cardQuery");
    });
  });

  test.describe("static list source (dropdown)", () => {
    test("should be able to use a static list source in the query builder", async ({
      page,
    }) => {
      await startNewNativeQuestion(page);
      await typeInNativeEditor(page, "SELECT * FROM PRODUCTS WHERE {{tag}}");
      await openTypePickerFromDefaultFilterType(page);
      await chooseType(page, "Field Filter");
      await mapFieldFilterTo(page, { table: "Products", field: "Ean" });
      await setWidgetType(page, "String");
      await setFilterListSource(page, {
        values: ["1018947080336", "7663515285824"],
      });
      await saveQuestion(page, "SQL filter", { path: ["Our analytics"] });

      await openEntryForm(page);
      await checkFilterValueNotInList(page, "0001664425970");
      await selectFilterValueFromList(page, "1018947080336");
      await expect(filterWidget(page)).toContainText("1018947080336");
      await runQuery(page, "cardQuery");
    });
  });

  test.describe("static list source with custom labels (dropdown)", () => {
    test("should be able to use a static list source in the query builder", async ({
      page,
    }) => {
      await startNewNativeQuestion(page);
      await typeInNativeEditor(page, "SELECT * FROM PRODUCTS WHERE {{tag}}");
      await openTypePickerFromDefaultFilterType(page);
      await chooseType(page, "Field Filter");
      await mapFieldFilterTo(page, { table: "Products", field: "Ean" });
      await setWidgetType(page, "String");
      await setFilterListSource(page, {
        values: [["1018947080336", "Custom Label"], "7663515285824"],
      });
      await saveQuestion(page, "SQL filter", { path: ["Our analytics"] });

      await openEntryForm(page);
      await checkFilterValueNotInList(page, "0001664425970");
      await checkFilterValueNotInList(page, "1018947080336");
      await selectFilterValueFromList(page, "Custom Label");
      await expect(filterWidget(page)).toContainText("Custom Label");
      await runQuery(page, "cardQuery");
    });
  });

  test.describe("static list source (search box)", () => {
    test("should be able to use a static list source in the query builder", async ({
      page,
    }) => {
      await startNewNativeQuestion(page);
      await typeInNativeEditor(page, "SELECT * FROM PRODUCTS WHERE {{tag}}");
      await openTypePickerFromDefaultFilterType(page);
      await chooseType(page, "Field Filter");
      await mapFieldFilterTo(page, { table: "Products", field: "Ean" });
      await setWidgetType(page, "String");

      await setSearchBoxFilterType(page);
      await setFilterListSource(page, {
        values: ["1018947080336", "7663515285824"],
      });
      await saveQuestion(page, "SQL filter", { path: ["Our analytics"] });

      await openEntryForm(page);

      await fieldValuesCombobox(popover(page)).pressSequentially("101");
      await popover(page).getByText("1018947080336", { exact: true }).click();

      await expect(fieldValuesValue(page, 0)).toBeVisible();
      await expect(fieldValuesValue(page, 0)).toContainText("1018947080336");
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      await expect(filterWidget(page)).toContainText("1018947080336");
    });
  });

  test.describe("static list source with custom labels (search box)", () => {
    test("should be able to use a static list source in the query builder", async ({
      page,
    }) => {
      await startNewNativeQuestion(page);
      await typeInNativeEditor(page, "SELECT * FROM PRODUCTS WHERE {{tag}}");
      await openTypePickerFromDefaultFilterType(page);
      await chooseType(page, "Field Filter");
      await mapFieldFilterTo(page, { table: "Products", field: "Ean" });
      await setWidgetType(page, "String");

      await setSearchBoxFilterType(page);
      await setFilterListSource(page, {
        values: [["1018947080336", "Custom Label"], "7663515285824"],
      });
      await saveQuestion(page, "SQL filter", { path: ["Our analytics"] });

      await openEntryForm(page);

      await fieldValuesCombobox(popover(page)).pressSequentially("Custom Label");
      await expect(
        popover(page).last().getByText("1018947080336", { exact: true }),
      ).toHaveCount(0);
      await popover(page)
        .last()
        .getByText("Custom Label", { exact: true })
        .click();
      await expect(fieldValuesValue(page, 0)).toBeVisible();
      await expect(fieldValuesValue(page, 0)).toContainText("Custom Label");
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      await expect(filterWidget(page)).toContainText("Custom Label");
    });
  });
});

test.describe("scenarios > filters > sql filters > values source > number parameter", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.updateSetting("enable-public-sharing", true);
  });

  test.describe("static list source (dropdown)", () => {
    test("should be able to use a static list source in the query builder", async ({
      page,
    }) => {
      await startNewNativeQuestion(page);
      await typeInNativeEditor(page, "SELECT {{ x }}");
      await openTypePickerFromDefaultFilterType(page);
      await chooseType(page, "Number");

      await setDropdownFilterType(page);
      await setFilterListSource(page, {
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
      await saveQuestion(page, "SQL filter", { path: ["Our analytics"] });

      await openEntryForm(page);
      await checkFilterValueNotInList(page, "10");
      await selectFilterValueFromList(page, "Twenty");
      await expect(filterWidget(page)).toContainText("Twenty");
      await runQuery(page, "cardQuery");
    });
  });

  test.describe("static list source with custom labels (dropdown)", () => {
    test("should be able to use a static list source in the query builder", async ({
      page,
    }) => {
      await startNewNativeQuestion(page);
      await typeInNativeEditor(page, "SELECT * FROM {{ tag }}");
      await openTypePickerFromDefaultFilterType(page);
      await chooseType(page, "Number");
      await setSearchBoxFilterType(page);
      await setFilterListSource(page, {
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
      await saveQuestion(page, "SQL filter", { path: ["Our analytics"] });

      await openEntryForm(page);
      await multiAutocompleteInput(dashboardParametersPopover(page)).pressSequentially(
        "Tw",
      );

      await checkFilterValueNotInList(page, "10");
      await checkFilterValueNotInList(page, "20");
      await popover(page).last().getByText("Twenty", { exact: true }).click();
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      await expect(filterWidget(page)).toContainText("Twenty");
      await runQuery(page, "cardQuery");
    });
  });

  test.describe("static list source (search box)", () => {
    test("should be able to use a static list source in the query builder", async ({
      page,
    }) => {
      await startNewNativeQuestion(page);
      await typeInNativeEditor(page, "SELECT {{ tag }}");
      await openTypePickerFromDefaultFilterType(page);
      await chooseType(page, "Number");

      await setSearchBoxFilterType(page);
      await setFilterListSource(page, {
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
      await saveQuestion(page, "SQL filter", { path: ["Our analytics"] });

      await openEntryForm(page);

      await multiAutocompleteInput(dashboardParametersPopover(page)).pressSequentially(
        "Tw",
      );
      await popover(page).last().getByText("Twenty", { exact: true }).click();

      await expect(multiAutocompleteValue(page, 0)).toBeVisible();
      await expect(multiAutocompleteValue(page, 0)).toContainText("Twenty");
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      await expect(filterWidget(page)).toContainText("Twenty");
    });
  });

  test("should show the values when picking the default value", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "SELECT {{ x }}");
    await openTypePickerFromDefaultFilterType(page);
    await chooseType(page, "Number");

    await setDropdownFilterType(page);
    await setFilterListSource(page, {
      values: [["10", "Ten"], ["20", "Twenty"], "30"],
    });

    await page
      .getByTestId("sidebar-content")
      .getByText("Enter a default value…", { exact: true })
      .click();

    await popover(page).getByText("Twenty", { exact: true }).click();
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await saveQuestion(page, "SQL filter", { path: ["Our analytics"] });

    await expect(filterWidget(page)).toContainText("Twenty");
    await runQuery(page, "cardQuery");
  });

  test("should clear the value type and config when changing the template tag type and restore them when changing the type back", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "SELECT * FROM PRODUCTS WHERE {{tag}}");
    await openTypePickerFromDefaultFilterType(page);
    await chooseType(page, "Text");
    await setSearchBoxFilterType(page);
    await setFilterListSource(page, { values: ["Foo", "Bar"] });
    await saveQuestion(page, "SQL filter", { path: ["Our analytics"] });

    await openTypePickerFromDefaultFilterType(page);
    await chooseType(page, "Number");

    await expect(page.getByLabel("Input box", { exact: true })).toBeChecked();

    await setSearchBoxFilterType(page);
    await checkFilterListSourceHasValue(page, { values: [] });

    await openTypePickerFromDefaultFilterType(page);
    await chooseType(page, "Field Filter");
    await setConnectedFieldSource(page, "Orders", "Total");

    await openTypePickerFromDefaultFilterType(page);
    await chooseType(page, "Text");
    await expect(page.getByLabel("Search box", { exact: true })).toBeChecked();
    await checkFilterListSourceHasValue(page, { values: ["Foo", "Bar"] });
  });
});

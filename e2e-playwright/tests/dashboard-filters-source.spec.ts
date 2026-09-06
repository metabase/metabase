/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-source.cy.spec.js
 *
 * Subject: where a dashboard filter's *values* come from — a structured card, a
 * native card, a card + a separate label column, a static custom list, or the
 * mapped field itself.
 *
 * Gate. The queue labels this spec `@external`, but only the SECOND describe
 * ("exotic types") carries that tag upstream; it restores `postgres-writable`
 * and drives the writable QA postgres container. The first describe is tagged
 * `@slow` and runs entirely on the H2 sample database. So 9 of the 11 tests
 * need no container and are NOT gated here — gating the whole file would have
 * silently skipped them.
 *
 * Under the `postgres-writable` snapshot, WRITABLE_DB_ID (2) genuinely is the
 * writable container — unlike under `postgres-12`, where 2 is the read-only QA
 * sample. Asserted at runtime in the exotic-types beforeEach.
 *
 * Dropped intercept: upstream's beforeEach registers
 * cy.intercept("POST", "/api/dataset").as("dataset") and never waits on it
 * anywhere in the file (rule 2). Waits live in visitDashboard/saveDashboard.
 *
 * Fixture ids are read from the generated fixture at import time, never
 * hardcoded: PRODUCTS_ID / PRODUCTS.CATEGORY come from SAMPLE_DATABASE
 * (e2e/support/cypress_sample_database.json — currently 7 and 61).
 *
 * Values derived from sample data (flagged for CI-jar drift, since CI builds a
 * merge commit): the PRODUCTS row count 200, the Gizmo-category count 51, and
 * the product titled "Rustic Paper Wallet" at ID 1. The label-source query
 * pins its own ordering (`ORDER BY ID ASC LIMIT 5`), so that list is not
 * relying on incidental row order.
 */
import type { Locator, Page } from "@playwright/test";

import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  setFilter,
  setFilterListSource,
  sidebar,
} from "../support/dashboard";
import {
  fieldValuesValueIn,
  resetIpAddressesTable,
  setFilterQuestionSource,
} from "../support/dashboard-filters-source";
import { createNativeQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { openQuestionActions } from "../support/models";
import { fieldValuesCombobox } from "../support/native-filters";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import { getTable } from "../support/actions-reproductions";
import {
  setDropdownFilterType,
  setSearchBoxFilterType,
} from "../support/sql-filters-source";
import { popover, visitDashboard, visitQuestion } from "../support/ui";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const structuredSourceQuestion = {
  name: "GUI source",
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
    query: "select CATEGORY from PRODUCTS WHERE CATEGORY != 'Doohickey'",
  },
};

const targetQuestion = {
  display: "scalar",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
};

test.describe("scenarios > dashboard > filters", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("structured question source", () => {
    test("should be able to use a structured question source", async ({
      page,
      mb,
    }) => {
      // upstream wraps this id as @questionId and revisits it at the end
      const { id: sourceQuestionId } = await mb.api.createQuestion(
        structuredSourceQuestion,
      );
      const { dashboardId } = await mb.api.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      });
      await visitDashboard(page, mb.api, dashboardId);

      await editDashboard(page);
      await setFilter(page, "Text or Category", "Is");
      await mapFilterToQuestion(page);
      await setFilterQuestionSource(page, {
        question: "GUI source",
        field: "Category",
      });
      await saveDashboard(page);
      await filterDashboard(page);

      await visitQuestion(page, sourceQuestionId);
      await archiveQuestion(page);
    });

    test("should be able to use a structured question source with string/contains parameter", async ({
      page,
      mb,
    }) => {
      await mb.api.createQuestion(structuredSourceQuestion);
      const { dashboardId } = await mb.api.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      });
      await visitDashboard(page, mb.api, dashboardId);

      await editDashboard(page);
      await setFilter(page, "Text or Category", "Contains");
      await mapFilterToQuestion(page);
      await setDropdownFilterType(page);
      await setFilterQuestionSource(page, {
        question: "GUI source",
        field: "Category",
      });
      await saveDashboard(page);

      // 200 = every PRODUCTS row (sample-data derived)
      await expect(
        getDashboardCard(page).getByText("200", { exact: true }),
      ).toBeVisible();
      await filterWidget(page).click();
      await popover(page).getByText("Gizmo", { exact: true }).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();
      // 51 = PRODUCTS rows with CATEGORY = Gizmo (sample-data derived)
      await expect(
        getDashboardCard(page).getByText("51", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("question source with custom labels", () => {
    const stringLabelSource = {
      name: "String label source",
      native: {
        query:
          "SELECT DISTINCT CATEGORY, CONCAT(CATEGORY, ' Label') AS LABEL " +
          "FROM PRODUCTS WHERE CATEGORY != 'Doohickey'",
      },
    };

    const numberLabelSource = {
      name: "Number label source",
      native: {
        query: "SELECT ID, TITLE FROM PRODUCTS ORDER BY ID ASC LIMIT 5",
      },
    };

    test("should remap a string value to a string label (string/string)", async ({
      page,
      mb,
    }) => {
      await createNativeQuestion(mb.api, stringLabelSource);
      const { dashboardId } = await mb.api.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      });
      await visitDashboard(page, mb.api, dashboardId);

      await editDashboard(page);
      await setFilter(page, "Text or Category", "Is");
      await mapFilterToQuestion(page);
      await setFilterQuestionSource(page, {
        question: "String label source",
        field: "CATEGORY",
        labelField: "LABEL",
      });
      await saveDashboard(page);

      // the dropdown shows the labels instead of the raw values
      await filterWidget(page).click();
      const dropdown = popover(page);
      await expect(
        dropdown.getByText("Gadget Label", { exact: true }),
      ).toBeVisible();
      await expect(
        dropdown.getByText("Gizmo Label", { exact: true }),
      ).toBeVisible();
      await expect(dropdown.getByText("Gizmo", { exact: true })).toHaveCount(0);
      await dropdown.getByText("Gizmo Label", { exact: true }).click();
      await dropdown.getByRole("button", { name: "Add filter" }).click();

      // the selected value is shown remapped to its label
      await expect(
        filterWidget(page).getByText("Gizmo Label", { exact: true }),
      ).toBeVisible();
    });

    test("should remap a number value to a string label (number/string)", async ({
      page,
      mb,
    }) => {
      await createNativeQuestion(mb.api, numberLabelSource);
      const { dashboardId } = await mb.api.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      });
      await visitDashboard(page, mb.api, dashboardId);

      await editDashboard(page);
      await setFilter(page, "Number", "Equal to", "Number");

      await mapFilterToQuestion(page, "Rating");
      await setFilterQuestionSource(page, {
        question: "Number label source",
        field: "ID",
        labelField: "TITLE",
      });
      await saveDashboard(page);

      // the dropdown shows the product titles instead of the numeric ids
      await filterWidget(page).click();
      const dropdown = popover(page);
      await expect(
        dropdown.getByText("Rustic Paper Wallet", { exact: true }),
      ).toBeVisible();
      await dropdown.getByText("Rustic Paper Wallet", { exact: true }).click();
      await dropdown.getByRole("button", { name: "Add filter" }).click();

      // the selected value is shown remapped to its label
      await expect(
        filterWidget(page).getByText("Rustic Paper Wallet", { exact: true }),
      ).toBeVisible();
    });

    test("should remap an id value to a string label (id/string)", async ({
      page,
      mb,
    }) => {
      await createNativeQuestion(mb.api, numberLabelSource);
      const { dashboardId } = await mb.api.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      });
      await visitDashboard(page, mb.api, dashboardId);

      await editDashboard(page);
      await setFilter(page, "ID");

      await mapFilterToQuestion(page, "ID");
      await setFilterQuestionSource(page, {
        question: "Number label source",
        field: "ID",
        labelField: "TITLE",
      });
      await saveDashboard(page);

      // the dropdown shows the product titles instead of the numeric ids
      await filterWidget(page).click();
      const dropdown = popover(page);
      await expect(
        dropdown.getByText("Rustic Paper Wallet", { exact: true }),
      ).toBeVisible();
      await dropdown.getByText("Rustic Paper Wallet", { exact: true }).click();
      await dropdown.getByRole("button", { name: "Add filter" }).click();

      // the selected value AND the remapped label are shown
      await expect(
        filterWidget(page).getByText("- 1", { exact: true }),
      ).toBeVisible();
      await expect(
        filterWidget(page).getByText("Rustic Paper Wallet", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("native question source", () => {
    test("should be able to use a native question source", async ({
      page,
      mb,
    }) => {
      const { id: sourceQuestionId } = await createNativeQuestion(
        mb.api,
        nativeSourceQuestion,
      );
      const { dashboardId } = await mb.api.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      });
      await visitDashboard(page, mb.api, dashboardId);

      await editDashboard(page);
      await setFilter(page, "Text or Category", "Is");
      await mapFilterToQuestion(page);
      await setFilterQuestionSource(page, {
        question: "SQL source",
        field: "CATEGORY",
      });
      await saveDashboard(page);
      await filterDashboard(page);

      await visitQuestion(page, sourceQuestionId);
      await archiveQuestion(page);
    });
  });

  test.describe("static list source (dropdown)", () => {
    test("should be able to use a static list source", async ({ page, mb }) => {
      const { dashboardId } = await mb.api.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      });
      await visitDashboard(page, mb.api, dashboardId);

      await editDashboard(page);
      await setFilter(page, "Text or Category", "Is");
      await mapFilterToQuestion(page);
      await setFilterListSource(page, {
        values: [["Gadget"], ["Gizmo", "Gizmo Label"], "Widget"],
      });
      await saveDashboard(page);
      await filterDashboard(page, { isLabeled: true });
      await expect(
        filterWidget(page).getByText("Gizmo Label", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("static list source (search)", () => {
    test("should be able to use a static list source (search)", async ({
      page,
      mb,
    }) => {
      const { dashboardId } = await mb.api.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      });
      await visitDashboard(page, mb.api, dashboardId);

      await editDashboard(page);
      await setFilter(page, "Text or Category", "Is");
      await mapFilterToQuestion(page);
      await sidebar(page).getByText("Search box", { exact: true }).click();
      await setFilterListSource(page, {
        values: [["Gadget"], ["Gizmo", "Gizmo Label"], "Widget"],
      });
      await saveDashboard(page);

      await setSearchFilter(page, "Gizmo Label");
    });
  });

  test.describe("field source", () => {
    test("should be able to use search box with fields configured for list", async ({
      page,
      mb,
    }) => {
      const { dashboardId } = await mb.api.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      });
      await visitDashboard(page, mb.api, dashboardId);

      await editDashboard(page);
      await setFilter(page, "Text or Category", "Is");
      await mapFilterToQuestion(page);
      await setSearchBoxFilterType(page);
      await saveDashboard(page);
      await filterDashboard(page, { isField: true });
    });
  });
});

test.describe("scenarios > dashboard > filters > exotic types", () => {
  const TABLE_NAME = "ip_addresses";

  // upstream tag: @external. Restores `postgres-writable` and rebuilds a table
  // in the writable QA postgres container (:5404).
  test.skip(
    !process.env.PW_QA_DB_ENABLED,
    "Requires the writable QA postgres container (:5404) and the postgres-writable snapshot (set PW_QA_DB_ENABLED)",
  );

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore("postgres-writable");
    await resetIpAddressesTable();
    await mb.signInAsAdmin();
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [TABLE_NAME],
    });

    // #85: the writable container is shared across slots and carries debris
    // schemas, so the lookup pins schema "public" (getTable's default).
    const table = await getTable(mb.api, {
      databaseId: WRITABLE_DB_ID,
      name: TABLE_NAME,
    });
    const countField = table.fields.find((field) => field.name === "count");
    if (!countField) {
      throw new Error(`No "count" field on ${TABLE_NAME}`);
    }
    await mb.api.put(`/api/field/${countField.id}`, {
      semantic_type: "type/Quantity",
    });

    const { dashboardId } = await mb.api.createQuestionAndDashboard({
      questionDetails: {
        database: WRITABLE_DB_ID,
        query: { "source-table": table.id },
      },
    });
    await visitDashboard(page, mb.api, dashboardId);
  });

  test("should be possible to use custom labels on IP address columns", async ({
    page,
  }) => {
    await editDashboard(page);
    await setFilter(page, "Text or Category", "Is");
    await mapFilterToQuestion(page, "Inet");
    await setFilterListSource(page, {
      values: [
        ["192.168.0.1/24", "Router"],
        ["127.0.0.1", "Localhost"],
        "0.0.0.1/0",
      ],
    });
    await saveDashboard(page);

    await openFilter(page);
    const dropdown = popover(page);
    await expect(dropdown.getByText("Router", { exact: true })).toBeVisible();
    await expect(dropdown.getByText("Localhost", { exact: true })).toBeVisible();
    await expect(dropdown.getByText("0.0.0.1/0", { exact: true })).toBeVisible();

    await dropdown.getByText("Router", { exact: true }).click();
    await dropdown.getByRole("button", { name: "Add filter" }).click();

    await expect(page.getByTestId("fixed-width-filters")).toContainText(
      "Router",
    );
  });

  test("should be possible to use custom labels on type/Quantity fields", async ({
    page,
  }) => {
    await editDashboard(page);
    await setFilter(page, "Text or Category", "Is");
    await mapFilterToQuestion(page, "Count");
    await setFilterListSource(page, {
      values: [["10", "Ten"], ["20", "Twenty"], "30"],
    });
    await saveDashboard(page);

    await openFilter(page);
    const dropdown = popover(page);
    await expect(dropdown.getByText("Ten", { exact: true })).toBeVisible();
    await expect(dropdown.getByText("Twenty", { exact: true })).toBeVisible();
    await expect(dropdown.getByText("30", { exact: true })).toBeVisible();

    await dropdown.getByText("Twenty", { exact: true }).click();
    await dropdown.getByRole("button", { name: "Add filter" }).click();

    await expect(page.getByTestId("fixed-width-filters")).toContainText(
      "Twenty",
    );
  });
});

const mapFilterToQuestion = async (page: Page, column = "Category") => {
  await page.getByText("Select…").click();
  await popover(page).getByText(column, { exact: true }).click();
};

const filterDashboard = async (
  page: Page,
  { isField = false, isLabeled = false }: { isField?: boolean; isLabeled?: boolean } = {},
) => {
  await page.getByText("Text", { exact: true }).click();

  const dropdown = popover(page);
  const GIZMO = isLabeled ? "Gizmo Label" : "Gizmo";

  await expect(dropdown.getByText(GIZMO, { exact: true })).toBeVisible();
  await expectDoohickey(dropdown, isField);
  await expect(dropdown.getByText("Gadget", { exact: true })).toBeVisible();
  await expect(dropdown.getByText("Widget", { exact: true })).toBeVisible();

  // real keystrokes: the list filters as you type
  await dropdown.getByPlaceholder("Search the list").pressSequentially("i");
  await expect(dropdown.getByText("Gadget", { exact: true })).toHaveCount(0);
  await expect(dropdown.getByText("Widget", { exact: true })).toBeVisible();
  await expectDoohickey(dropdown, isField);

  await dropdown.getByText(GIZMO, { exact: true }).click();
  await dropdown.getByRole("button", { name: "Add filter" }).click();
};

/** Upstream: should(isField ? "be.visible" : "not.exist"). The non-field
 * sources all exclude Doohickey, so its absence is what proves the custom
 * source is in effect rather than the raw field values. */
const expectDoohickey = async (dropdown: Locator, isField: boolean) => {
  const doohickey = dropdown.getByText("Doohickey", { exact: true });
  if (isField) {
    await expect(doohickey).toBeVisible();
  } else {
    await expect(doohickey).toHaveCount(0);
  }
};

const openFilter = async (page: Page) => {
  await page.getByText("Text", { exact: true }).click();
};

const archiveQuestion = async (page: Page) => {
  await openQuestionActions(page);
  await page.getByTestId("archive-button").click();
  // Upstream is a bare cy.findByText(...) — an EXISTENCE assertion, not a
  // visibility one, so toHaveCount(1) is the faithful port. The wording is
  // load-bearing: the "filter that uses it" clause only renders when the
  // card's parameter_usage_count is exactly 1 (ArchiveCardModal.tsx
  // getWarningMessage), i.e. the dashboard filter really is sourcing from it.
  await expect(
    page.getByText(
      "This question will be removed from any dashboards or alerts using it. It will also be removed from the filter that uses it to populate values.",
      { exact: true },
    ),
  ).toHaveCount(1);
};

const setSearchFilter = async (page: Page, label: string) => {
  await filterWidget(page).click();
  await fieldValuesCombobox(popover(page)).pressSequentially(label);

  // Two popovers coexist: the filter widget's and the typeahead it opens.
  // Upstream uses H.popover().last() for the suggestion.
  await popover(page).last().getByText(label, { exact: true }).click();

  // Upstream then re-enters H.popover().within(...). By this point the
  // typeahead has closed, so .first() is the filter popover — and it matches
  // Cypress's within(), which requires a single element.
  const widgetPopover = popover(page).first();
  const value = fieldValuesValueIn(widgetPopover, 0);
  await expect(value).toBeVisible();
  await expect(value).toContainText(label);
  await widgetPopover.getByRole("button", { name: "Add filter" }).click();

  await expect(
    filterWidget(page).getByText(label, { exact: true }),
  ).toBeVisible();
};

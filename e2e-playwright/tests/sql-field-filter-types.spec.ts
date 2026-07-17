/**
 * Playwright port of
 * e2e/test/scenarios/native-filters/sql-field-filter-types.cy.spec.js
 *
 * Porting notes:
 * - The "@external" Boolean field-filter describe needs the writable
 *   postgres QA container (port 5404) and the postgres-writable snapshot →
 *   gated on QA_DB_ENABLED per the porting playbook.
 * - H.resetTestTable is a cy.task backed by knex; the port replays the exact
 *   knex DDL through the pg client (resetManyDataTypesTable in
 *   support/native-filters-extras.ts).
 * - H.runNativeQuery({ wait: false }) exists because a run on a SAVED
 *   question goes through POST /api/card/:id/query, so the Cypress @dataset
 *   intercept would never resolve. runNativeQueryEitherEndpoint waits on
 *   whichever of the two endpoints fires — strictly stronger than no-wait,
 *   and it removes the "assert against stale scalar" race.
 */
import type { Page } from "@playwright/test";

import { filterWidget } from "../support/dashboard";
import { test, expect } from "../support/fixtures";
import {
  startNewNativeQuestion,
  typeInNativeEditor,
} from "../support/native-editor";
import {
  clearFilterWidget,
  chooseType,
  mapFieldFilterTo,
  openTypePickerFromDefaultFilterType,
} from "../support/native-filters";
import {
  resetManyDataTypesTable,
  runNativeQueryEitherEndpoint,
} from "../support/native-filters-extras";
import { assertQueryBuilderRowCount } from "../support/notebook";
import { resyncDatabase, WRITABLE_DB_ID } from "../support/schema-viewer";
import { saveQuestion } from "../support/sharing";
import { popover } from "../support/ui";

async function assertScalarValue(page: Page, value: string) {
  await expect(
    page.getByTestId("scalar-value").getByText(value, { exact: true }),
  ).toBeVisible();
}

test.describe(
  "scenarios > filters > sql filters > field filter > Boolean",
  { tag: "@external" },
  () => {
    const tableName = "many_data_types";

    // Needs the writable postgres QA container and the postgres-writable
    // snapshot, neither of which exist in the default Playwright CI setup.
    test.skip(
      !process.env.QA_DB_ENABLED,
      "Requires the writable postgres QA database and its postgres-writable snapshot (set QA_DB_ENABLED)",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.restore("postgres-writable");
      await resetManyDataTypesTable();
      await mb.signInAsAdmin();
      await resyncDatabase(mb.api, {
        dbId: WRITABLE_DB_ID,
        tables: [tableName],
      });
    });

    test("should be able to use boolean field filters", async ({ page }) => {
      // setup a boolean field filter
      await startNewNativeQuestion(page, { database: WRITABLE_DB_ID });
      await typeInNativeEditor(
        page,
        `SELECT count(*) FROM ${tableName} WHERE {{f}}`,
      );
      await openTypePickerFromDefaultFilterType(page);
      await chooseType(page, "Field Filter");
      await mapFieldFilterTo(page, {
        table: "Many Data Types",
        field: "Boolean",
      });
      await saveQuestion(page, "SQL", { path: ["Our analytics"] });

      // field filter with true
      await runNativeQueryEitherEndpoint(page);
      await assertScalarValue(page, "2");
      await filterWidget(page).click();
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();
      await runNativeQueryEitherEndpoint(page);
      await assertScalarValue(page, "1");
      await clearFilterWidget(page);
      await runNativeQueryEitherEndpoint(page);
      await assertScalarValue(page, "2");

      // field filter with false
      await filterWidget(page).click();
      const dropdown = popover(page);
      await dropdown.getByText("False", { exact: true }).click();
      await dropdown
        .getByRole("button", { name: "Add filter", exact: true })
        .click();
      await runNativeQueryEitherEndpoint(page);
      await assertScalarValue(page, "1");
      await clearFilterWidget(page);
      await runNativeQueryEitherEndpoint(page);
      await assertScalarValue(page, "2");
    });
  },
);

test.describe("scenarios > filters > sql filters > variable > Boolean", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be able to define boolean variables in the query", async ({
    page,
  }) => {
    // new query
    await startNewNativeQuestion(page);
    await typeInNativeEditor(
      page,
      "select id from products [[where category = (case when {{boolean}} then 'Gadget' else 'Widget' end)]]",
    );
    await openTypePickerFromDefaultFilterType(page);
    await chooseType(page, "Boolean");

    // assert that it works for an ad-hoc query
    await filterWidget(page).click();
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await runNativeQueryEitherEndpoint(page);
    await assertQueryBuilderRowCount(page, 53);

    // assert that it works for a saved query
    await saveQuestion(page, "SQL");
    await filterWidget(page).click();
    const dropdown = popover(page);
    await dropdown.getByLabel("False", { exact: true }).click();
    await dropdown
      .getByRole("button", { name: "Update filter", exact: true })
      .click();
    await runNativeQueryEitherEndpoint(page);
    await assertQueryBuilderRowCount(page, 54);
  });
});

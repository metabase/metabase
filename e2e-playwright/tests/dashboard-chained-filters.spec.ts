/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-chained-filters.cy.spec.js
 *
 * Port notes
 * ----------
 * - The two `limit <has_field_values> options based on linked filter` tests
 *   are UNTAGGED and run against the plain `default` snapshot / H2 sample
 *   database. They are the actual subject of the file: a State filter
 *   constrains which City values the linked City filter offers.
 * - The third test (`should work for all field types (metabase#15170)`) is
 *   `@external`: it restores `postgres-writable`, rebuilds `many_data_types`
 *   in the writable QA postgres container and syncs it. Gated on
 *   PW_QA_DB_ENABLED (PORTING rule 6). Despite living in this file it is not
 *   a chained-filter test at all — it checks that a dashboard ID parameter
 *   can be click-behavior-mapped to a uuid column.
 *   The skip is at DESCRIBE level (there is no afterEach here, but the
 *   describe-level form is the safe one and keeps the gate mapping obvious).
 * - `cy.findByText(x)` with a string is an EXACT testing-library match →
 *   `getByText(x, { exact: true })` (PORTING rule 1). `cy.contains(x)` is a
 *   case-sensitive substring → regex/`hasText` (rule 1's corollary).
 * - `H.filterWidget().contains("Location")` resolves to the innermost matching
 *   descendant of the first matching widget. We click the widget element
 *   instead (`filterWidget().filter({ hasText }).first()`); the click target
 *   is inside the same widget and the widget is what opens the popover, so
 *   the behaviour is identical while staying strict-mode safe.
 * - `cy.findByRole("switch").parent().get("label")`: `cy.get` inside
 *   `.within()` re-queries from the within-scope root, so upstream is really
 *   "the (single) <label> in the tabpanel". Ported as exactly that, with an
 *   explicit toHaveCount(1) to preserve Cypress's single-element `.click()`
 *   requirement. Clicking the label (not the input) is deliberate here —
 *   upstream's comment says the input has 0 width/height, and Playwright
 *   would refuse to click it without force.
 * - Typeahead/search boxes get real keystrokes (`pressSequentially`), not
 *   `fill()` — the dropdown filtering depends on them (rule 5).
 * - No `cy.intercept`/`cy.wait` aliases exist anywhere in this spec, so there
 *   is no queue to port (rule 2 / the "does it await anything at all" check).
 */
import { expect, test } from "../support/fixtures";
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  selectDropdown,
  setFilter,
  sidebar,
} from "../support/dashboard";
import {
  type HasFieldValues,
  valuesWidget,
  WRITABLE_PG_SKIP_REASON,
} from "../support/dashboard-chained-filters";
import { dashboardParametersPopover } from "../support/dashboard-core";
import { showDashboardCardActions } from "../support/dashboard-cards";
import { addOrUpdateDashboardCard } from "../support/drillthroughs";
import { resetTestTable } from "../support/actions-on-dashboards";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import {
  ORDERS_DASHBOARD_ID,
  SAMPLE_DATABASE,
} from "../support/sample-data";
import { icon, popover, visitDashboard } from "../support/ui";

const { PEOPLE } = SAMPLE_DATABASE;

test.describe("scenarios > dashboard > chained filter", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  for (const hasFieldValues of ["search", "list"] as HasFieldValues[]) {
    test(`limit ${hasFieldValues} options based on linked filter`, async ({
      page,
      mb,
    }) => {
      await mb.api.put(`/api/field/${PEOPLE.CITY}`, {
        has_field_values: hasFieldValues,
      });
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

      await editDashboard(page);

      // add a state filter
      await setFilter(page, "Location", "Is", "Location");

      // connect that to people.state
      const dashcard = getDashboardCard(page);
      await expect(
        dashcard.getByText("Column to filter on", { exact: true }),
      ).toBeVisible();
      await dashcard.getByText("Select…", { exact: true }).click();

      await popover(page).getByText("State", { exact: true }).click();

      // open the linked filters tab, and click the click to add a City filter
      await page
        .getByRole("tab")
        .filter({ hasText: /Linked filters/ })
        .click();

      await page
        .getByRole("tabpanel")
        .getByText("add another dashboard filter", { exact: true })
        .click();

      await popover(page).getByText("Location", { exact: true }).click();

      // Cypress: sidebar().findByText("Filter operator").next().click()
      await sidebar(page)
        .locator(":text('Filter operator') + *")
        .click();
      await selectDropdown(page).getByText("Is", { exact: true }).click();

      // connect that to person.city
      await expect(
        dashcard.getByText("Column to filter on", { exact: true }),
      ).toBeVisible();
      await dashcard.getByText("Select…", { exact: true }).click();
      await popover(page).getByText("City", { exact: true }).click();

      await page
        .getByRole("tab")
        .filter({ hasText: /Linked filters/ })
        .click();

      // Link city to state
      const tabpanel = page.getByRole("tabpanel");
      // turn on the switch, input has 0 width and height
      await expect(tabpanel.locator("label")).toHaveCount(1);
      await tabpanel.locator("label").click();

      // open up the list of linked columns
      await tabpanel.getByText("Location", { exact: true }).click();
      // It's hard to assert on the "table.column" pairs.
      // We just assert that the headers are there to know that something appeared.
      await expect(
        tabpanel.getByText("Filtering column", { exact: true }),
      ).toBeVisible();
      await expect(
        tabpanel.getByText("Filtered column", { exact: true }),
      ).toBeVisible();

      await saveDashboard(page);

      // now test that it worked!
      // Select Alaska as a state. We should see Anchorage as a option but not Anacoco
      await filterWidget(page)
        .filter({ hasText: /Location/ })
        .first()
        .click();

      await expect(page.getByPlaceholder(/search the list/i)).toBeVisible();

      await popover(page).getByText("AK", { exact: true }).click();
      await popover(page).getByText("Add filter", { exact: true }).click();

      await filterWidget(page)
        .filter({ hasText: /Location 1/ })
        .first()
        .click();

      await typeInValuesSearch(page, hasFieldValues, "An");

      await expect(
        valuesWidget(page, hasFieldValues).getByText("Anchorage", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        valuesWidget(page, hasFieldValues).getByText("Anacoco", {
          exact: true,
        }),
      ).toHaveCount(0);

      await clearValuesSearch(page, hasFieldValues);

      await filterWidget(page)
        .filter({ hasText: /AK/ })
        .first()
        .click();

      // Upstream disambiguates with H.popover().last() — the value dropdown of
      // the still-open City widget can coexist with the State popover.
      await popover(page).last().getByText("AK", { exact: true }).click();
      await popover(page).last().getByText("GA", { exact: true }).click();
      await popover(page)
        .last()
        .getByText("Update filter", { exact: true })
        .click();

      // do it again to make sure it isn't cached incorrectly
      await filterWidget(page)
        .filter({ hasText: /Location 1/ })
        .first()
        .click();
      await typeInValuesSearch(page, hasFieldValues, "An");

      await expect(
        valuesWidget(page, hasFieldValues).getByText("Canton", { exact: true }),
      ).toBeVisible();
      await expect(
        valuesWidget(page, hasFieldValues).getByText("Anchorage", {
          exact: true,
        }),
      ).toHaveCount(0);

      if (hasFieldValues === "search") {
        // close the suggestion list
        await dashboardParametersPopover(page).getByRole("combobox").blur();
      }

      await filterWidget(page)
        .filter({ hasText: /GA/ })
        .first()
        .click();
      await popover(page).last().getByText("GA", { exact: true }).click();
      await popover(page)
        .last()
        .getByText("Update filter", { exact: true })
        .click();

      // do it again without a state filter to make sure it isn't cached incorrectly
      await filterWidget(page)
        .filter({ hasText: /Location 1/ })
        .first()
        .click();
      await typeInValuesSearch(page, hasFieldValues, "An");

      const widget = valuesWidget(page, hasFieldValues);
      await expect(widget.getByText("Adrian", { exact: true })).toBeVisible();
      await expect(widget.getByText("Anchorage", { exact: true })).toBeVisible();
      await expect(widget.getByText("Canton", { exact: true })).toBeVisible();
    });
  }

  test.describe("15170", () => {
    test.skip(!process.env.PW_QA_DB_ENABLED, WRITABLE_PG_SKIP_REASON);

    test("should work for all field types (metabase#15170)", async ({
      page,
      mb,
    }) => {
      const dialect = "postgres" as const;
      const TEST_TABLE = "many_data_types";

      await mb.restore(`${dialect}-writable`);
      await resetTestTable({ type: dialect, table: TEST_TABLE });
      await mb.signInAsAdmin();
      await resyncDatabase(mb.api, {
        dbId: WRITABLE_DB_ID,
        tables: [TEST_TABLE],
      });

      // Upstream's `tableAlias` wraps the table object from
      // GET /api/database/:id/metadata — same source, read directly here.
      const metadata = (await (
        await mb.api.get(`/api/database/${WRITABLE_DB_ID}/metadata`)
      ).json()) as {
        tables: {
          id: number;
          name: string;
          fields: { id: number; name: string }[];
        }[];
      };
      const testTable = metadata.tables.find(
        (table) => table.name === TEST_TABLE,
      );
      if (!testTable) {
        throw new Error(`Table ${TEST_TABLE} not found on db ${WRITABLE_DB_ID}`);
      }
      const testTableId = testTable.id;
      const uuidFieldId = testTable.fields.find(
        (field) => field.name === "uuid",
      )!.id;
      const idFieldId = testTable.fields.find((field) => field.name === "id")!
        .id;

      // Mimics that UUID is the table's primary key, so we could map dashboard
      // ID parameter to UUID
      await mb.api.put(`/api/field/${idFieldId}`, { semantic_type: null });
      await mb.api.put(`/api/field/${uuidFieldId}`, {
        semantic_type: "type/PK",
      });

      const { id: questionId } = await mb.api.createQuestion({
        name: "15170",
        database: WRITABLE_DB_ID,
        query: { "source-table": testTableId },
      });
      const { id: dashboardId } = await mb.api.createDashboard();

      // Add filter to the dashboard
      await mb.api.put(`/api/dashboard/${dashboardId}`, {
        parameters: [{ id: "50c9eac6", name: "ID", slug: "id", type: "id" }],
      });

      // Add previously created question to the dashboard
      await addOrUpdateDashboardCard(mb.api, {
        card_id: questionId,
        dashboard_id: dashboardId,
      });

      const dashboard = (await mb.api.getDashboard(dashboardId)).body as {
        dashcards: { id: number }[];
      };
      const dashCardId = dashboard.dashcards[0].id;

      // Connect filter to that question
      await mb.api.put(`/api/dashboard/${dashboardId}`, {
        dashcards: [
          {
            id: dashCardId,
            card_id: questionId,
            row: 0,
            col: 0,
            size_x: 11,
            size_y: 6,
            parameter_mappings: [
              {
                parameter_id: "50c9eac6",
                card_id: questionId,
                target: ["dimension", ["field-id", uuidFieldId]],
              },
            ],
          },
        ],
      });

      await visitDashboard(page, mb.api, dashboardId);
      await icon(page, "pencil").click();
      await showDashboardCardActions(page);
      await icon(getDashboardCard(page), "click").click();
      await page.getByText("UUID", { exact: true }).click();
      await page
        .getByText("Update a dashboard filter", { exact: true })
        .click();
      await page
        .getByText("Available filters", { exact: true })
        .locator("..")
        .getByText("ID", { exact: true })
        .click();
      await expect(
        selectDropdown(page).getByText("UUID", { exact: true }),
      ).toBeVisible();
    });
  });
});

/**
 * Port of the repeated
 *   H.dashboardParametersPopover().within(() => { ...type("An") })
 * block. The search-backed widget types into the Mantine combobox; the
 * list-backed one into the "Search the list" text input. `pressSequentially`
 * rather than `fill` — the dropdown filters on real keystrokes (rule 5).
 */
async function typeInValuesSearch(
  page: import("@playwright/test").Page,
  mode: HasFieldValues,
  text: string,
) {
  const scope = dashboardParametersPopover(page);
  const input =
    mode === "search"
      ? scope.getByRole("combobox")
      : scope.getByPlaceholder("Search the list");
  await input.click();
  await input.pressSequentially(text);
}

/**
 * Port of the "clear it back out" block. Search mode presses backspace twice
 * and blurs to close the suggestion list; list mode clears the search input.
 */
async function clearValuesSearch(
  page: import("@playwright/test").Page,
  mode: HasFieldValues,
) {
  const scope = page.getByTestId("parameter-value-dropdown");
  if (mode === "search") {
    const combobox = scope.getByRole("combobox");
    await combobox.press("Backspace");
    await combobox.press("Backspace");
    // close the suggestion list
    await combobox.blur();
  } else {
    await scope.getByPlaceholder("Search the list").fill("");
  }
}

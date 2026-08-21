/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-sql-required-simple-filter.cy.spec.js
 *
 * A SQL question with a REQUIRED simple text template-tag ({{filter}}, default
 * "Foo") connected to a dashboard text filter (string/=, default "Bar"). The
 * single test walks the default-value precedence between the two and asserts the
 * URL search string at each step (dashboard default → cleared → SQL default
 * survives reload → dashboard default re-applied on a fresh visit → default
 * removed).
 *
 * Porting notes:
 * - The create-and-connect flow lives in
 *   support/dashboard-filters-sql-required-simple-filter.ts
 *   (setupRequiredSimpleFilterDashboard).
 * - The connected dashboard filter renders as an INLINE simple text widget: with
 *   a value it holds it as the textbox value ("Bar"); cleared, it shows the
 *   placeholder "Text". So cy.findByDisplayValue("Bar") / cy.findByPlaceholderText
 *   ("Text") target that one inline widget.
 * - cy.location("search").should("eq", ...) was Cypress-retried → expect.poll on
 *   the URL search (a one-shot check catches transient states — PORTING).
 * - cy.findByTestId("dashcard").contains(str) → toContainText (case-sensitive
 *   substring, like cy.contains).
 * - findByPlaceholderText / findByText string args are exact (rule 1).
 */
import { clearFilterWidget, filterWidget } from "../support/dashboard-parameters";
import {
  removeDefaultFilterValue,
  setupRequiredSimpleFilterDashboard,
} from "../support/dashboard-filters-sql-required-simple-filter";
import { editDashboard, saveDashboard } from "../support/dashboard";
import { findByDisplayValue } from "../support/filters-repros";
import { test, expect } from "../support/fixtures";
import { visitDashboard } from "../support/ui";

test.describe(
  "scenarios > dashboard > filters > SQL > simple filter > required ",
  () => {
    test.beforeEach(async ({ page, mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();

      const dashboardId = await setupRequiredSimpleFilterDashboard(mb.api);
      await visitDashboard(page, mb.api, dashboardId);
    });

    test("should respect default filter precedence while properly updating the url for each step of the flow", async ({
      page,
    }) => {
      const search = () => new URL(page.url()).search;

      // Default dashboard filter
      await expect.poll(search).toBe("?text=Bar");

      await expect(page.getByTestId("dashcard")).toContainText("Bar");

      // The connected filter renders as an inline text widget; unscoped in
      // Cypress, scoped here to the parameters bar where that input lives.
      await findByDisplayValue(
        page.getByTestId("dashboard-parameters-widget-container"),
        "Bar",
      );

      await clearFilterWidget(page);

      await expect.poll(search).toBe("?text=");

      // SQL question defaults
      await expect(page.getByTestId("dashcard")).toContainText("Foo");

      // The empty filter widget
      await expect(
        page.getByPlaceholder("Text", { exact: true }),
      ).toBeVisible();

      await page.reload();

      // This part confirms that the issue metabase#13960 has been fixed
      await expect.poll(search).toBe("?text=");

      await expect(page.getByTestId("dashcard")).toContainText("Foo");

      // Let's make sure the default dashboard filter is respected upon a
      // subsequent visit from the root
      await page.goto("/collection/root");
      await page
        .getByText("Required Filters Dashboard", { exact: true })
        .click();

      await expect.poll(search).toBe("?text=Bar");

      // Finally, when we remove the dashboard filter's default value, the url
      // should reflect that by removing the placeholder
      await editDashboard(page);

      await filterWidget(page, { isEditing: true, name: "Text" }).click();

      await removeDefaultFilterValue(page, "Bar");

      await saveDashboard(page);

      // The URL query params should include the value from the dashboard filter
      // default
      await expect.poll(search).toBe("?text=");
    });
  },
);

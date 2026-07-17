/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/funnel.cy.spec.js
 *
 * H.moveDnDKitElementByAlias({ useMouseEvents: true }) is ported as the
 * real-mouse moveDnDKitElement — dnd-kit's MouseSensor accepts real input
 * natively (PORTING.md: real mouse is the default for visible targets).
 */
import { openVizSettingsSidebar } from "../support/charts";
import { getDraggableElements } from "../support/charts-extras";
import { sidebar } from "../support/dashboard";
import { icon, moveDnDKitElement } from "../support/dashboard-cards";
import { queryBuilderFiltersPanel } from "../support/detail-view";
import { test, expect } from "../support/fixtures";
import { filter, selectFilterOperator } from "../support/nested-questions";
import { visitQuestionAdhoc } from "../support/permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { popover } from "../support/ui";

const { PEOPLE_ID, PEOPLE } = SAMPLE_DATABASE;

test.describe("scenarios > visualizations > funnel chart", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    await visitQuestionAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": PEOPLE_ID,
          aggregation: [["count"]],
          breakout: [["field", PEOPLE.SOURCE]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "funnel",
    });
    await openVizSettingsSidebar(page);
    await sidebar(page).getByText("Data", { exact: true }).click();
  });

  test("should allow you to reorder and show/hide rows", async ({ page }) => {
    // ensure that rows are shown
    await expect(getDraggableElements(page)).toHaveCount(5);

    const name = (await getDraggableElements(page).first().textContent()) ?? "";
    // move row `name` down 2
    await expect(page.getByTestId("funnel-chart-header").first()).toHaveText(
      name,
    );

    await moveDnDKitElement(getDraggableElements(page).first(), {
      vertical: 100,
    });

    await expect(getDraggableElements(page).nth(2)).toHaveText(name);
    await expect(page.getByTestId("funnel-chart-header").nth(2)).toHaveText(
      name,
    );

    // toggle row visibility
    await icon(getDraggableElements(page).nth(1), "eye_outline").click({
      force: true,
    });
    await expect(page.getByTestId("funnel-chart-header")).toHaveCount(4);

    await icon(getDraggableElements(page).nth(1), "eye_crossed_out").click({
      force: true,
    });
    await expect(page.getByTestId("funnel-chart-header")).toHaveCount(5);
  });

  test("should handle row items being filterd out and returned gracefully", async ({
    page,
  }) => {
    await moveDnDKitElement(getDraggableElements(page).first(), {
      vertical: 100,
    });

    await icon(getDraggableElements(page).nth(1), "eye_outline").click({
      force: true,
    });

    await filter(page);
    await popover(page).getByText("Source", { exact: true }).click();
    await selectFilterOperator(page, "Is not");
    await popover(page).getByText("Facebook", { exact: true }).click();
    await popover(page)
      .getByRole("button", { name: "Apply filter", exact: true })
      .click();

    await expect(getDraggableElements(page)).toHaveCount(4);

    // Ensures that "Google" is still hidden, so its state hasn't changed.
    await icon(getDraggableElements(page).nth(0), "eye_crossed_out").click({
      force: true,
    });

    // remove filter
    await icon(queryBuilderFiltersPanel(page), "close").click();

    await expect(getDraggableElements(page)).toHaveCount(5);

    // Re-added items should appear at the end of the list.
    await expect(getDraggableElements(page).nth(0)).toHaveText("Google");
    await expect(getDraggableElements(page).nth(4)).toHaveText("Facebook");
  });
});

/**
 * Playwright port of
 * e2e/test/scenarios/dashboard/visualizer/columns-mapping.cy.spec.ts
 *
 * Port notes:
 * - No gating tags upstream; runs on the EE spike backend.
 * - beforeEach creates two questions (via idAlias/wrapId upstream). Their ids
 *   are never read by either test — the questions only need to EXIST so they
 *   appear in the "Add questions" sidebar — so the port just creates them and
 *   drops the wrapId aliasing.
 * - Dropped never-awaited intercepts: @dataset, @cardQuery and @dashcardQuery
 *   are registered upstream but never cy.wait()ed in this spec.
 * - Shared visualizer helpers come from support/visualizer-basics.ts; the two
 *   new fixtures (ACCOUNTS_COUNT_BY_COUNTRY / COUNTRY_CODES) and clickUndoButton
 *   live in support/visualizer-columns-mapping.ts.
 * - The `H.modal().within(...)` blocks become modal(page)-scoped locators. The
 *   well helpers (pieMetricWell / verticalWell / …) only exist inside the modal,
 *   so page-global resolution is fine.
 * - Test 1 changes viz type via the viz-picker icons (icon(...,"pie")/"funnel"),
 *   mirroring upstream's `cy.findByTestId("viz-picker-main").icon("pie")`.
 * - The pie total ("18,760") is ECharts SVG text (getByText doesn't trim), so it
 *   uses the whitespace-tolerant echartsTextExact scoped to the modal.
 */
import { expect, test } from "../support/fixtures";
import { editDashboard } from "../support/dashboard";
import { icon, modal, visitDashboard } from "../support/ui";
import { ORDERS_DASHBOARD_ID } from "../support/sample-data";
import {
  ORDERS_COUNT_BY_PRODUCT_CATEGORY,
  assertDataSourceColumnSelected,
  assertWellItems,
  clickVisualizeAnotherWay,
  createDashboard,
  createQuestion,
  horizontalWell,
  openQuestionsSidebar,
  pieDimensionWell,
  pieMetricWell,
  selectVisualization,
  verticalWell,
} from "../support/visualizer-basics";
import { echartsTextExact } from "../support/visualizer-cartesian";
import {
  ACCOUNTS_COUNT_BY_COUNTRY,
  COUNTRY_CODES,
  clickUndoButton,
} from "../support/visualizer-columns-mapping";

test.describe("scenarios > dashboard > visualizer > columns-mapping", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    await createQuestion(mb.api, ACCOUNTS_COUNT_BY_COUNTRY);
    await createQuestion(mb.api, ORDERS_COUNT_BY_PRODUCT_CATEGORY);
  });

  test("should remap columns when changing a viz type", async ({ page, mb }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);

    await openQuestionsSidebar(page);
    await clickVisualizeAnotherWay(page, ORDERS_COUNT_BY_PRODUCT_CATEGORY.name);

    const dialog = modal(page);

    // Turn into a pie chart
    await icon(dialog.getByTestId("viz-picker-main"), "pie").click();
    await assertDataSourceColumnSelected(
      page,
      ORDERS_COUNT_BY_PRODUCT_CATEGORY.name,
      "Count",
    );
    await assertDataSourceColumnSelected(
      page,
      ORDERS_COUNT_BY_PRODUCT_CATEGORY.name,
      "Product → Category",
    );
    await expect(
      pieMetricWell(page).getByText("Count", { exact: true }),
    ).toBeVisible();
    await expect(
      pieDimensionWell(page).getByText("Product → Category", { exact: true }),
    ).toBeVisible();
    await expect(echartsTextExact(dialog, "18,760")).toBeVisible(); // total value

    // Turn into a funnel
    await icon(dialog.getByTestId("viz-picker-main"), "funnel").click();
    await assertDataSourceColumnSelected(
      page,
      ORDERS_COUNT_BY_PRODUCT_CATEGORY.name,
      "Count",
    );
    await assertDataSourceColumnSelected(
      page,
      ORDERS_COUNT_BY_PRODUCT_CATEGORY.name,
      "Product → Category",
    );
    await expect(
      verticalWell(page).getByText("Count", { exact: true }),
    ).toBeVisible();

    const horizontal = horizontalWell(page);
    await expect(
      horizontal.getByText("Product → Category", { exact: true }),
    ).toBeVisible();
    await expect(horizontal.getByText("Doohickey", { exact: true })).toBeVisible();
    await expect(horizontal.getByText("Gadget", { exact: true })).toBeVisible();
    await expect(horizontal.getByText("Gizmo", { exact: true })).toBeVisible();
    await expect(horizontal.getByText("Widget", { exact: true })).toBeVisible();
    await expect(horizontal.getByTestId("well-item")).toHaveCount(5);
  });

  test("should preserve column mapping when switching between cartesian and pie", async ({
    page,
    mb,
  }) => {
    const dashboardId = await createDashboard(mb.api);
    await visitDashboard(page, mb.api, dashboardId);

    await editDashboard(page);

    await openQuestionsSidebar(page);
    await clickVisualizeAnotherWay(page, ACCOUNTS_COUNT_BY_COUNTRY.name);

    await assertWellItems(page, { horizontal: ["Country"], vertical: ["Count"] });

    // cartesian (starting point) -> funnel -> scatter
    await selectVisualization(page, "funnel");
    await assertWellItems(page, {
      horizontal: ["Country", ...COUNTRY_CODES],
      vertical: ["Count"],
    });
    await selectVisualization(page, "scatter");
    await assertWellItems(page, { horizontal: ["Country"], vertical: ["Count"] });

    // Resetting the visualization to cartesian
    await clickUndoButton(page);
    await clickUndoButton(page);

    // cartesian (starting point) -> pie -> funnel -> scatter
    await selectVisualization(page, "pie");
    await assertWellItems(page, {
      pieDimensions: ["Country"],
      pieMetric: ["Count"],
    });
    await selectVisualization(page, "funnel");
    await assertWellItems(page, {
      horizontal: ["Country", ...COUNTRY_CODES],
      vertical: ["Count"],
    });
    await selectVisualization(page, "scatter");
    await assertWellItems(page, { horizontal: ["Country"], vertical: ["Count"] });
  });
});

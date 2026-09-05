/**
 * Playwright port of
 * e2e/test/scenarios/embedding/embedding-linked-filters.cy.spec.js
 * (metabase#13639, metabase#13868) — static embedding of a dashboard whose
 * child filter (City) is constrained by a parent filter (State) both for a
 * native SQL question with field filters and a GUI question.
 *
 * Porting notes:
 * - H.visitEmbeddedPage navigates straight to the signed /embed/* page
 *   (top-level page.goto — support/embedding-dashboard.ts), so every locator is
 *   page-scoped (not framed).
 * - cy.location("search") assertions are retried in Cypress → expect.poll.
 * - Fixtures + spec-local helpers (openFilterOptions / assertOnXYAxisLabels /
 *   searchFieldValuesFilter / removeValueForFilter / applyFilterToast) are
 *   ported into support/embedding-linked-filters.ts.
 * - No never-awaited intercepts; no snowplow.
 */
import { chartPathWithFillColor } from "../support/binning";
import { getDashboardCard } from "../support/dashboard";
import { fieldValuesTextbox } from "../support/dashboard-filters-reset-clear";
import { applyFilterButton, filterWidget } from "../support/dashboard-parameters";
import {
  createNativeQuestionAndDashboard,
  createQuestionAndDashboard,
} from "../support/factories";
import { visitEmbeddedPage } from "../support/embedding-dashboard";
import {
  applyFilterToast,
  assertOnXYAxisLabels,
  expectEchartsTextContains,
  expectEchartsTextNotContains,
  guiDashboard,
  guiQuestion,
  mapGUIDashboardParameters,
  mapNativeDashboardParameters,
  nativeDashboardDetails,
  nativeQuestionDetails,
  openFilterOptions,
  removeValueForFilter,
  searchFieldValuesFilter,
} from "../support/embedding-linked-filters";
import { test, expect } from "../support/fixtures";
import { removeFieldValuesValue } from "../support/native-filters";
import { tableInteractiveBody } from "../support/question-new";
import { assertEChartsTooltip } from "../support/viz-charts-repros";
import { popover } from "../support/ui";

async function expectSearchEquals(page: import("@playwright/test").Page, search: string) {
  await expect.poll(() => new URL(page.url()).search).toBe(search);
}

test.describe("scenarios > embedding > dashboard > linked filters (metabase#13639, metabase#13868)", () => {
  test.describe("SQL question with field filters", () => {
    let dashboardId: number;

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();

      const { id, card_id, dashboard_id } = await createNativeQuestionAndDashboard(
        mb.api,
        {
          questionDetails: nativeQuestionDetails,
          dashboardDetails: nativeDashboardDetails,
        },
      );
      dashboardId = dashboard_id;

      await mapNativeDashboardParameters(mb.api, { id, card_id, dashboard_id });

      // Enable embedding with both the city and state filters enabled.
      await mb.api.put(`/api/dashboard/${dashboard_id}`, {
        embedding_params: { city: "enabled", state: "enabled" },
        enable_embedding: true,
      });
    });

    test("works when both filters are enabled and their values are set through UI", async ({
      page,
      mb,
    }) => {
      await visitEmbeddedPage(page, mb, {
        resource: { dashboard: dashboardId },
        params: {},
      });

      await expect(
        page.getByRole("heading", { name: nativeDashboardDetails.name }),
      ).toBeVisible();
      await expect(getDashboardCard(page)).toContainText(
        nativeQuestionDetails.name,
      );

      await expect(chartPathWithFillColor(page, "#509EE3")).toHaveCount(49);

      await assertOnXYAxisLabels(page, { xLabel: "STATE", yLabel: "count" });

      await expectEchartsTextContains(page, "TX");
      await expectEchartsTextContains(page, "AK");

      await openFilterOptions(page, "State");

      await popover(page).getByText("AK", { exact: true }).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      await expectSearchEquals(page, "?city=&state=AK");

      await expectEchartsTextContains(page, "AK");
      await expectEchartsTextNotContains(page, "TX");

      const stateBar = chartPathWithFillColor(page, "#509EE3");
      await expect(stateBar).toHaveCount(1);
      await stateBar.hover();
      await assertEChartsTooltip(page, {
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "68" }],
        blurAfter: true,
      });

      await openFilterOptions(page, "City");

      await searchFieldValuesFilter(page);

      await fieldValuesTextbox(
        popover(page).filter({ hasText: "Add filter" }),
      )
        .first()
        .click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      await expectSearchEquals(page, "?city=Anchorage&state=AK");

      const cityBar = chartPathWithFillColor(page, "#509EE3");
      await expect(cityBar).toHaveCount(1);
      await cityBar.hover();
      await assertEChartsTooltip(page, {
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "1" }],
      });
    });

    test("works when both filters are enabled and their values are set through UI with auto-apply filters disabled", async ({
      page,
      mb,
    }) => {
      await mb.api.put(`/api/dashboard/${dashboardId}`, {
        auto_apply_filters: false,
      });

      await visitEmbeddedPage(page, mb, {
        resource: { dashboard: dashboardId },
        params: {},
      });

      await expect(
        page.getByRole("heading", { name: nativeDashboardDetails.name }),
      ).toBeVisible();
      await expect(getDashboardCard(page)).toContainText(
        nativeQuestionDetails.name,
      );

      await assertOnXYAxisLabels(page, { xLabel: "STATE", yLabel: "count" });

      await expect(chartPathWithFillColor(page, "#509EE3")).toHaveCount(49);
      await expectEchartsTextContains(page, "AK");
      await expectEchartsTextContains(page, "TX");

      await openFilterOptions(page, "State");

      await expect(applyFilterToast(page)).toHaveCount(0);

      await popover(page).getByText("AK", { exact: true }).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      await applyFilterButton(page).click();
      await expect(applyFilterToast(page)).toHaveCount(0);

      await expectSearchEquals(page, "?city=&state=AK");

      await expectEchartsTextContains(page, "AK");
      await expectEchartsTextNotContains(page, "TX");

      const stateBar = chartPathWithFillColor(page, "#509EE3");
      await expect(stateBar).toHaveCount(1);
      await stateBar.hover();
      await assertEChartsTooltip(page, {
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "68" }],
        blurAfter: true,
      });

      await openFilterOptions(page, "City");

      await searchFieldValuesFilter(page);

      await fieldValuesTextbox(
        popover(page).filter({ hasText: "Add filter" }),
      )
        .first()
        .click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      await applyFilterButton(page).click();
      await expect(applyFilterToast(page)).toHaveCount(0);

      await expectSearchEquals(page, "?city=Anchorage&state=AK");

      const cityBar = chartPathWithFillColor(page, "#509EE3");
      await expect(cityBar).toHaveCount(1);
      await cityBar.hover();
      await assertEChartsTooltip(page, {
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "1" }],
      });
    });

    test("works when main filter's value is set through URL", async ({
      page,
      mb,
    }) => {
      await visitEmbeddedPage(
        page,
        mb,
        { resource: { dashboard: dashboardId }, params: {} },
        { setFilters: { state: "AK" } },
      );

      await expect(filterWidget(page)).toHaveCount(2);

      const stateBar = chartPathWithFillColor(page, "#509EE3");
      await expect(stateBar).toHaveCount(1);
      await stateBar.hover();
      await assertEChartsTooltip(page, {
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "68" }],
        blurAfter: true,
      });

      await openFilterOptions(page, "City");

      await searchFieldValuesFilter(page);

      await fieldValuesTextbox(
        popover(page).filter({ hasText: "Add filter" }),
      )
        .first()
        .click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      await expectSearchEquals(page, "?city=Anchorage&state=AK");

      const cityBar = chartPathWithFillColor(page, "#509EE3");
      await expect(cityBar).toHaveCount(1);
      await cityBar.hover();
      await assertEChartsTooltip(page, {
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "1" }],
      });
    });

    test("works when main filter's value is set through URL and when it is hidden at the same time", async ({
      page,
      mb,
    }) => {
      await visitEmbeddedPage(
        page,
        mb,
        { resource: { dashboard: dashboardId }, params: {} },
        {
          setFilters: { state: "AK" },
          additionalHashOptions: { hideFilters: ["state"] },
        },
      );

      const stateBar = chartPathWithFillColor(page, "#509EE3");
      await expect(stateBar).toHaveCount(1);
      await stateBar.hover();
      await assertEChartsTooltip(page, {
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "68" }],
        blurAfter: true,
      });

      await expect(filterWidget(page)).toHaveCount(1);
      await expect(filterWidget(page)).toContainText("City");
      await filterWidget(page).click();

      await searchFieldValuesFilter(page);

      await fieldValuesTextbox(
        popover(page).filter({ hasText: "Add filter" }),
      )
        .first()
        .click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      await expectSearchEquals(page, "?city=Anchorage&state=AK");

      const cityBar = chartPathWithFillColor(page, "#509EE3");
      await expect(cityBar).toHaveCount(1);
      await cityBar.hover();
      await assertEChartsTooltip(page, {
        header: "AK",
        rows: [{ color: "#509EE3", name: "count", value: "1" }],
      });
    });

    test("works when main filter is locked", async ({ page, mb }) => {
      await mb.api.put(`/api/dashboard/${dashboardId}`, {
        embedding_params: { city: "enabled", state: "locked" },
      });

      await visitEmbeddedPage(page, mb, {
        resource: { dashboard: dashboardId },
        params: { state: ["AK"] },
      });

      await expect(filterWidget(page)).toHaveCount(1);
      await expect(filterWidget(page)).toContainText("City");
      await filterWidget(page).click();

      await searchFieldValuesFilter(page);

      await fieldValuesTextbox(
        popover(page).filter({ hasText: "Add filter" }),
      )
        .first()
        .click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      await expectSearchEquals(page, "?city=Anchorage");
    });
  });

  test.describe("GUI question in the dashboard", () => {
    let dashboardId: number;

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();

      const { id, card_id, dashboard_id } = await createQuestionAndDashboard(
        mb.api,
        {
          questionDetails: guiQuestion,
          dashboardDetails: guiDashboard,
        },
      );
      dashboardId = dashboard_id;

      await mapGUIDashboardParameters(mb.api, id, card_id, dashboard_id);

      await mb.api.put(`/api/dashboard/${dashboard_id}`, {
        embedding_params: { id_filter: "enabled", category: "enabled" },
        enable_embedding: true,
      });
    });

    test("works when both filters are enabled and their values are set through UI", async ({
      page,
      mb,
    }) => {
      await visitEmbeddedPage(page, mb, {
        resource: { dashboard: dashboardId },
        params: {},
      });

      // ID filter already comes with the default value.
      await expectSearchEquals(page, "?category=&id_filter=1");

      // But it should still be editable, hence two filter widgets.
      await expect(filterWidget(page)).toHaveCount(2);
      await filterWidget(page, { name: "Category" }).click();

      const pop = popover(page);
      await pop.getByText("Gizmo", { exact: true }).click();
      await expect(pop.getByText("Doohickey", { exact: true })).toHaveCount(0);
      await expect(pop.getByText("Gadget", { exact: true })).toHaveCount(0);
      await expect(pop.getByText("Widget", { exact: true })).toHaveCount(0);
      await pop.getByRole("button", { name: "Add filter" }).click();

      await expectSearchEquals(page, "?category=Gizmo&id_filter=1");

      await expect(tableInteractiveBody(page).getByRole("row")).toHaveCount(1);
      await expect(tableInteractiveBody(page)).toContainText("Gizmo");
    });

    test("works when main filter's value is set through URL", async ({
      page,
      mb,
    }) => {
      // Make sure we can override the default value.
      await visitEmbeddedPage(
        page,
        mb,
        { resource: { dashboard: dashboardId }, params: {} },
        { setFilters: { id_filter: 4 } },
      );

      await expectSearchEquals(page, "?id_filter=4");

      await expect(filterWidget(page)).toHaveCount(2);
      await filterWidget(page, { name: "Category" }).click();

      const pop = popover(page);
      await pop.getByText("Doohickey", { exact: true }).click();
      await expect(pop.getByText("Gizmo", { exact: true })).toHaveCount(0);
      await expect(pop.getByText("Gadget", { exact: true })).toHaveCount(0);
      await expect(pop.getByText("Widget", { exact: true })).toHaveCount(0);
      await pop.getByRole("button", { name: "Add filter" }).click();

      await expectSearchEquals(page, "?category=Doohickey&id_filter=4");

      await expect(tableInteractiveBody(page).getByRole("row")).toHaveCount(1);
      await expect(tableInteractiveBody(page)).toContainText("Doohickey");

      // Make sure we can set multiple values.
      await page.evaluate(() => {
        window.location.search = "?category=Widget&id_filter=4&id_filter=29";
      });

      await expect(filterWidget(page)).toHaveCount(2);
      await expect(
        filterWidget(page).filter({ hasText: "2 selections" }),
      ).toHaveCount(1);
      await expect(
        filterWidget(page).filter({ hasText: "Widget" }),
      ).toHaveCount(1);

      await expect(tableInteractiveBody(page).getByRole("row")).toHaveCount(1);
      await expect(tableInteractiveBody(page)).toContainText("Widget");
      await expect(tableInteractiveBody(page)).toContainText(
        "Durable Steel Toucan",
      );

      await removeValueForFilter(page, "Category");

      await expect(tableInteractiveBody(page).getByRole("row")).toHaveCount(2);
      await expect(tableInteractiveBody(page)).toContainText("Widget");
      await expect(tableInteractiveBody(page)).toContainText("Doohickey");
      await expect(tableInteractiveBody(page)).toContainText(
        "Durable Steel Toucan",
      );

      await page.getByText("2 selections", { exact: true }).click();

      // Remove one of the previously set filter values.
      await removeFieldValuesValue(popover(page), 1);

      await page.getByRole("button", { name: "Update filter" }).click();

      await expect(tableInteractiveBody(page).getByRole("row")).toHaveCount(1);
      await expect(tableInteractiveBody(page)).toContainText("Doohickey");

      await openFilterOptions(page, "Category");

      const pop2 = popover(page);
      await expect(pop2.getByText("Doohickey", { exact: true })).toBeVisible();
      await expect(pop2.getByText("Gizmo", { exact: true })).toHaveCount(0);
      await expect(pop2.getByText("Gadget", { exact: true })).toHaveCount(0);
      await expect(pop2.getByText("Widget", { exact: true })).toHaveCount(0);
    });

    test("works when the default filter is hidden", async ({ page, mb }) => {
      await visitEmbeddedPage(
        page,
        mb,
        { resource: { dashboard: dashboardId }, params: {} },
        { additionalHashOptions: { hideFilters: ["id_filter"] } },
      );

      await expect(tableInteractiveBody(page).getByRole("row")).toHaveCount(1);
      await expect(tableInteractiveBody(page)).toContainText("Gizmo");

      await expect(filterWidget(page)).toHaveCount(1);
      await expect(filterWidget(page)).toContainText("Category");
      await filterWidget(page).click();

      const pop = popover(page);
      await expect(pop.getByText("Gizmo", { exact: true })).toBeVisible();
      await expect(pop.getByText("Doohickey", { exact: true })).toHaveCount(0);
      await expect(pop.getByText("Gadget", { exact: true })).toHaveCount(0);
      await expect(pop.getByText("Widget", { exact: true })).toHaveCount(0);
    });

    test("works when the default filter is locked", async ({ page, mb }) => {
      await mb.api.put(`/api/dashboard/${dashboardId}`, {
        embedding_params: { id_filter: "locked", category: "enabled" },
      });

      await visitEmbeddedPage(page, mb, {
        resource: { dashboard: dashboardId },
        params: { id_filter: [1] },
      });

      await expect(tableInteractiveBody(page).getByRole("row")).toHaveCount(1);
      await expect(tableInteractiveBody(page)).toContainText("Gizmo");

      await expect(filterWidget(page)).toHaveCount(1);
      await expect(filterWidget(page)).toContainText("Category");
      await filterWidget(page).click();

      const pop = popover(page);
      await expect(pop.getByText("Gizmo", { exact: true })).toBeVisible();
      await expect(pop.getByText("Doohickey", { exact: true })).toHaveCount(0);
      await expect(pop.getByText("Gadget", { exact: true })).toHaveCount(0);
      await expect(pop.getByText("Widget", { exact: true })).toHaveCount(0);
    });
  });
});

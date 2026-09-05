/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-cards/dashboard-sections.cy.spec.js
 *
 * Dashboard "sections" — the pre-built layout templates added from the "Add
 * section" (+) menu in edit mode; inserting a section adds a group of
 * placeholder ("Select question") cards.
 *
 * - Snowplow assertions run against the per-slot collector (support/snowplow).
 * - The @cardQuery intercept is registered inside selectQuestion before the
 *   pick that triggers it (PORTING rule 2).
 */
import { test, expect } from "../support/fixtures";
import {
  editDashboard,
  getDashboardCard,
  pickEntity,
  saveDashboard,
} from "../support/dashboard";
import { createNewTab, getDashboardCards } from "../support/dashboard-core";
import {
  addSection,
  assertPlaceholderCardCanBeDragged,
  filterPanel,
  mapDashCardToFilter,
  overwriteDashCardTitle,
  selectQuestion,
} from "../support/dashboard-sections";
import { dashboardGrid } from "../support/drillthroughs";
import { createDashboard } from "../support/factories";
import { READ_ONLY_PERSONAL_COLLECTION_ID } from "../support/documents-core";
import { ORDERS_DASHBOARD_ID } from "../support/sample-data";
import { goToTab, visitDashboard } from "../support/ui";
import {
  enableTracking,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";

// Port of createMockParameter({ id: "1", name: "Category", type: "string/=" }) —
// slug stays "text" (the mock default; name is not derived into slug).
const CATEGORY_FILTER = {
  id: "1",
  name: "Category",
  type: "string/=",
  slug: "text",
};

test.describe("scenarios > dashboard cards > sections", () => {
  test.beforeEach(async ({ page, mb }) => {
    await resetSnowplow(mb);
    await mb.restore();
    await mb.signInAsAdmin();
    await enableTracking(mb);

    await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [CATEGORY_FILTER],
    });
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
  });

  test.afterEach(async ({ mb }) => {
    await expectNoBadSnowplowEvents(mb);
  });

  test("should add sections and select a question for an empty card", async ({
    page,
    mb,
  }) => {
    await editDashboard(page);

    await expect(getDashboardCards(page)).toHaveCount(1);
    await addSection(page, "KPIs w/ large chart below");
    await expect(getDashboardCards(page)).toHaveCount(7);
    await expectUnstructuredSnowplowEvent(mb, {
      event: "dashboard_section_added",
      section_layout: "kpi_chart_below",
    });

    await page
      .getByPlaceholder(
        "You can connect widgets to {{variables}} in heading cards.",
      )
      .fill("This is a heading");
    await selectQuestion(page, "Orders, Count");

    await createNewTab(page);
    await expect(getDashboardCards(page)).toHaveCount(0);
    await addSection(page, "KPI grid");
    await expect(getDashboardCards(page)).toHaveCount(5);
    await expectUnstructuredSnowplowEvent(mb, {
      event: "dashboard_section_added",
      section_layout: "kpi_grid",
    });

    // Verify placeholder cards can be dragged (metabase#UXW-3387)
    await assertPlaceholderCardCanBeDragged(page);

    await selectQuestion(page, "Orders, Count, Grouped by Created At (year)");

    await overwriteDashCardTitle(
      page,
      1,
      "Orders, Count, Grouped by Created At (year)",
      "Line chart",
    );
    // TODO: if the mapping is done before the title is changed, the mapping is lost
    await mapDashCardToFilter(getDashboardCard(page, 1), "Category");

    await goToTab(page, "Tab 1");
    await saveDashboard(page);

    const tab1Grid = dashboardGrid(page);
    await expect(tab1Grid.getByTestId("dashcard-container")).toHaveCount(7);
    await expect(
      tab1Grid.getByText("Select question", { exact: true }),
    ).toHaveCount(0);

    await expect(
      tab1Grid.getByText("This is a heading", { exact: true }),
    ).toBeVisible();
    await expect(
      tab1Grid.getByText("Orders, Count", { exact: true }),
    ).toBeVisible();
    await expect(tab1Grid.getByText("Orders", { exact: true })).toBeVisible();

    await expect(
      tab1Grid.getByText("Line chart", { exact: true }),
    ).toHaveCount(0);
    await expect(
      tab1Grid.getByText("Orders, Count, Grouped by Created At (year)", {
        exact: true,
      }),
    ).toHaveCount(0);

    await goToTab(page, "Tab 2");

    const tab2Grid = dashboardGrid(page);
    await expect(tab2Grid.getByTestId("dashcard-container")).toHaveCount(5);
    await expect(
      tab2Grid.getByText("Select question", { exact: true }),
    ).toHaveCount(0);

    await expect(
      tab2Grid.getByText("Line chart", { exact: true }),
    ).toBeVisible();

    await expect(
      tab2Grid.getByText("This is a heading", { exact: true }),
    ).toHaveCount(0);
    await expect(
      tab2Grid.getByText("Orders, Count", { exact: true }),
    ).toHaveCount(0);
    await expect(tab2Grid.getByText("Orders", { exact: true })).toHaveCount(0);
    await expect(
      tab2Grid.getByText("Orders, Count, Grouped by Created At (year)", {
        exact: true,
      }),
    ).toHaveCount(0);

    // Ensure parameter mapping is persisted
    await editDashboard(page);
    await filterPanel(page).getByText("Category", { exact: true }).click();
    await expect(
      getDashboardCard(page, 1).getByText("Product.Category", { exact: true }),
    ).toBeVisible();
  });
});

test.describe(
  "scenarios > dashboard cards > sections > read only collections",
  () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signIn("readonly");
    });

    test("Should allow you to select entities in collections you have read access to (metabase#50602)", async ({
      page,
      mb,
    }) => {
      const dashboard = await createDashboard(mb.api, {
        collection_id: READ_ONLY_PERSONAL_COLLECTION_ID,
      });
      await visitDashboard(page, mb.api, dashboard.id);

      await editDashboard(page);
      await addSection(page, "KPIs w/ large chart below");

      // cy.wait(["@getCollectionItems", "@getCollectionItems"]) — the two
      // collection-items GETs the picker fires. Register both before the click
      // that opens the picker (PORTING rule 2).
      const collectionItems = Array.from({ length: 2 }, () =>
        page.waitForResponse((response) =>
          /^\/api\/collection\/[^/]+\/items/.test(
            new URL(response.url()).pathname,
          ),
        ),
      );
      await dashboardGrid(page)
        .getByText("Select question", { exact: true })
        .first()
        .click({ force: true });
      await Promise.all(collectionItems);

      // H.pickEntity({ path }) — click the path items; the leaf click selects
      // the question (no select button in this picker).
      await pickEntity(page, { path: ["Our analytics", "Orders, Count"] });

      await expect(
        dashboardGrid(page).getByText("Orders, Count", { exact: true }),
      ).toBeVisible();
    });
  },
);

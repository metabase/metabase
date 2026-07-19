/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-clear-and-restore.cy.spec.ts
 *
 * The Cypress original registers cy.intercept("POST", "/api/dataset").as("dataset")
 * in beforeEach but never waits on it — dropped here. Response waits live where
 * they're needed (visitDashboard, saveDashboard).
 */
import {
  editDashboard,
  saveDashboard,
  setFilter,
  setFilterListSource,
} from "../support/dashboard";
import {
  checkFilterListSourceHasValue,
  editFilter,
  editFilterType,
  mapFilterToQuestion,
  setFilterSourceFromConnectedFields,
} from "../support/dashboard-filters-clear-and-restore";
import { test } from "../support/fixtures";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { visitDashboard } from "../support/ui";

const { ORDERS_ID } = SAMPLE_DATABASE;

test.describe("dashboard filters values source config clearing and restoring", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should clear and restore parameter static-list values when the type changes", async ({
    page,
    mb,
  }) => {
    const { dashboardId } = await mb.api.createQuestionAndDashboard({
      questionDetails: {
        display: "scalar",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
      },
    });

    await visitDashboard(page, mb.api, dashboardId);

    await editDashboard(page);
    await setFilter(page, "Number", "Equal to", "Foo");
    await mapFilterToQuestion(page);
    await setFilterListSource(page, {
      values: [["10", "Ten"], ["20", "Twenty"], "30"],
    });
    await saveDashboard(page);

    await editDashboard(page);
    await editFilter(page, "Foo");

    await editFilterType(page, "Text or Category", "Is");
    await checkFilterListSourceHasValue(page, { values: [] });

    await mapFilterToQuestion(page, "Email");
    await setFilterSourceFromConnectedFields(page);

    await editFilterType(page, "Number", "Equal to");
    await checkFilterListSourceHasValue(page, {
      values: [["10", "Ten"], ["20", "Twenty"], "30"],
    });
  });
});

/**
 * Playwright port of
 * e2e/test/scenarios/metrics/reproductions/metrics-reproductions.cy.spec.ts
 *
 * A grab-bag of metrics bug reproductions — each `describe` is one issue number,
 * preserved verbatim:
 *   - #47058: notebook shows a loading page while metric query_metadata loads
 *             (never a flash of "[Unknown Metric]").
 *   - #44171: editing a metric's aggregation then combining it with another
 *             metric on a dashcard via the visualizer keeps both series.
 *   - #32037: editing a metric prompts an unsaved-changes modal that can discard.
 */
import { test, expect } from "../support/fixtures";
import { editDashboard, getDashboardCard, sidebar } from "../support/dashboard";
import { getDashboardCards } from "../support/dashboard-core";
import { MetricEditor } from "../support/metrics-editing";
import { MetricPage } from "../support/metrics";
import { chartLegendItem } from "../support/metrics-dashboard";
import {
  delayQueryMetadata,
  main,
  waitForQueryMetadata,
} from "../support/metrics-reproductions";
import { getNotebookStep } from "../support/notebook";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { modal, popover, visitDashboard } from "../support/ui";
import {
  openQuestionsSidebar,
  selectDataset,
  showDashcardVisualizerModal,
  switchToAddMoreData,
} from "../support/visualizer-basics";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

test.describe("issue 47058", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should show the loading page while the question metadata is being fetched (metabase#47058)", async ({
    page,
    mb,
  }) => {
    // The Cypress intercept delays every query_metadata by 1s so the loading
    // state is observable — register before navigating.
    await delayQueryMetadata(page, 1000);

    const { id: metricId } = await mb.api.createQuestion({
      name: "Metric 47058",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
    });
    const { id: questionId } = await mb.api.createQuestion({
      name: "Question 47058",
      type: "question",
      query: {
        "source-table": ORDERS_ID,
        fields: [
          ["field", ORDERS.ID, {}],
          ["field", ORDERS.TOTAL, {}],
        ],
        aggregation: [["metric", metricId]],
        limit: 1,
      },
    });

    const metadata = waitForQueryMetadata(page);
    await page.goto(`/question/${questionId}/notebook`);

    const region = main(page);
    await expect(region.getByText("Loading...", { exact: true })).toBeVisible();
    await expect(getNotebookStep(page, "summarize")).toHaveCount(0);
    await expect(
      region.getByText("[Unknown Metric]", { exact: true }),
    ).toHaveCount(0);

    await metadata;

    await expect(region.getByText("Loading...", { exact: true })).toHaveCount(0);
    await expect(getNotebookStep(page, "summarize")).toBeVisible();
    await expect(
      region.getByText("[Unknown Metric]", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 44171", () => {
  const METRIC_A = {
    name: "Metric 44171-A",
    type: "metric",
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          { "temporal-unit": "month", "base-type": "type/DateTime" },
        ],
      ],
    },
  };

  const METRIC_B = {
    name: "Metric 44171-B",
    type: "metric",
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          { "temporal-unit": "month", "base-type": "type/DateTime" },
        ],
      ],
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not save viz settings on metrics", async ({ page, mb }) => {
    await mb.api.createQuestion(METRIC_A);
    const { id: metricBId } = await mb.api.createQuestion(METRIC_B);
    const { id: dashboardId } = await mb.api.createDashboard({
      name: "Dashboard 44171",
    });

    await page.goto(`/metric/${metricBId}/query`);
    await expect(MetricEditor.queryEditor(page)).toBeVisible();

    await getNotebookStep(page, "summarize")
      .getByText("Count", { exact: true })
      .click();
    await popover(page).getByText("Sum of ...", { exact: true }).click();
    await popover(page).getByText("Total", { exact: true }).click();

    const saveCard = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
    );
    await MetricEditor.saveButton(page).click();
    await saveCard;

    await visitDashboard(page, mb.api, dashboardId);

    await editDashboard(page);
    await openQuestionsSidebar(page);

    await sidebar(page).getByText("Metric 44171-A", { exact: true }).click();
    // Adding a dashcard via the sidebar is async — anchor on the card landing
    // before hovering it (PORTING: saveDashboard / card-add pacing gotcha).
    await expect(getDashboardCards(page)).toHaveCount(1);

    // H.showDashboardCardActions(0) + getDashboardCard(0).realHover()
    //   .findByLabelText("Visualize another way").click()
    await showDashcardVisualizerModal(page, 0, { isVisualizerCard: false });

    const dialog = modal(page);
    await switchToAddMoreData(page);
    await selectDataset(page, "Metric 44171-B");
    await expect(chartLegendItem(dialog, "Metric 44171-A")).toBeVisible();
    await expect(chartLegendItem(dialog, "Metric 44171-B")).toBeVisible();
  });
});

test.describe("issue 32037", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should show unsaved changes modal and allow to discard changes when editing a metric (metabase#32037)", async ({
    page,
    mb,
  }) => {
    const { id: metricId } = await mb.api.createQuestion({
      name: "Metric 32037",
      type: "metric",
      display: "line",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            { "temporal-unit": "month", "base-type": "type/DateTime" },
          ],
        ],
      },
    });

    await page.goto(`/metric/${metricId}/query`);
    await expect(MetricEditor.queryEditor(page)).toBeVisible();
    await expect(MetricEditor.saveButton(page)).toHaveCount(0);

    await getNotebookStep(page, "summarize")
      .getByText("Count", { exact: true })
      .click();
    await popover(page).getByText("Sum of ...", { exact: true }).click();
    await popover(page).getByText("Total", { exact: true }).click();

    await expect(MetricEditor.saveButton(page)).toBeVisible();

    await MetricEditor.aboutTab(page).click();

    const dialog = modal(page);
    await expect(
      dialog.getByText("Discard your changes?", { exact: true }),
    ).toBeVisible();
    await dialog.getByText("Discard changes", { exact: true }).click();

    await expect(MetricPage.aboutPage(page)).toBeVisible();
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe(`/metric/${metricId}`);
  });
});

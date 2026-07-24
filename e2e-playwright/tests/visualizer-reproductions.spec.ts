/**
 * Playwright port of
 * e2e/test/scenarios/dashboard/visualizer/reproductions.cy.spec.ts
 *
 * A grab-bag of visualizer bug reproductions; every issue number is preserved.
 *
 * Port notes:
 * - beforeEach's `cy.intercept("POST","/api/card/*​/query").as("cardQuery")` is
 *   ported as waitForCardQueries (register before the swap-dataset click, await
 *   after) — imported read-only from support/visualizer-basics.
 * - Issue 61521's "Visualize another way" open uses showDashcardVisualizerModal
 *   (isVisualizerCard:false) — the realHover + click "Visualize another way"
 *   done by the Cypress spec, plus modal-open + loader gating.
 * - The "no unformatted axis" checks (findByText("0.06").should("not.exist"))
 *   are ported as NON-exact getByText (substring). ECharts SVG axis <text>
 *   carries leading/trailing whitespace which Playwright's exact getByText does
 *   NOT trim (testing-library does), so an exact match would vacuously pass the
 *   absence assertion even if an unformatted axis were present. Substring is the
 *   whitespace-tolerant, non-vacuous equivalent.
 * - Issue 65908 has no visualizer UI; it drives dashboard-height calculation
 *   with hide_empty cards. findByDisplayValue (EditableText title = <textarea>)
 *   is imported from support/filters-repros.
 * - No new shared helpers were required; the createDashcard builder and the
 *   dateParameters fixture stay spec-local (as they are in Cypress).
 */
import { createQuestionAndAddToDashboard } from "../support/dashboard-card-repros";
import { editDashboard, getDashboardCard } from "../support/dashboard";
import {
  createDashboard,
  createDashboardWithQuestions,
  createQuestion,
} from "../support/factories";
import { findByDisplayValue, updateDashboardCards } from "../support/filters-repros";
import { expect, test } from "../support/fixtures";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { modal, visitDashboard } from "../support/ui";
import {
  showDashcardVisualizerModal,
  switchToAddMoreData,
  waitForCardQueries,
} from "../support/visualizer-basics";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE as {
  ORDERS: Record<string, number>;
  ORDERS_ID: number;
};

test.describe("issue 61521", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should preserve column settings when use visualizer (metabase#61521)", async ({
    page,
    mb,
  }) => {
    const questionADetails = {
      name: "Question A for 61521",
      display: "line" as const,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          [
            "aggregation-options",
            [
              "/",
              ["sum", ["field", ORDERS.TAX, { "base-type": "type/Float" }]],
              ["sum", ["field", ORDERS.SUBTOTAL, { "base-type": "type/Float" }]],
            ],
            { name: "Tax over Sub", "display-name": "Tax over Sub" },
          ],
        ],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            { "base-type": "type/DateTime", "temporal-unit": "month" },
          ],
        ],
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["Tax over Sub"],
        column_settings: {
          '["name","Tax over Sub"]': { number_style: "percent" },
        },
      },
    };

    const questionBDetails = {
      name: "Question B for 61521",
      display: "line" as const,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          [
            "aggregation-options",
            [
              "/",
              ["sum", ["field", ORDERS.TAX, { "base-type": "type/Float" }]],
              ["sum", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }]],
            ],
            { name: "Tax over Total", "display-name": "Tax over Total" },
          ],
        ],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            { "base-type": "type/DateTime", "temporal-unit": "month" },
          ],
        ],
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["Tax over Total"],
        column_settings: {
          '["name","Tax over Total"]': { number_style: "percent" },
        },
      },
    };

    await createQuestion(mb.api, questionBDetails);

    const dashboard = await createDashboard(mb.api);
    await createQuestionAndAddToDashboard(mb.api, questionADetails, dashboard.id);

    await visitDashboard(page, mb.api, dashboard.id);

    await editDashboard(page);
    await showDashcardVisualizerModal(page, 0, { isVisualizerCard: false });

    const dialog = modal(page);

    await switchToAddMoreData(page);

    const swap = dialog
      .getByTestId("swap-dataset-button")
      .filter({ has: page.getByText("Question B for 61521", { exact: true }) })
      .first();
    await expect(swap).not.toHaveAttribute("aria-pressed", "true");

    const cardQuery = waitForCardQueries(page, 1);
    await swap.click({ force: true });
    await cardQuery;

    await expect(
      dialog
        .getByLabel("Legend", { exact: true })
        .getByText("Question B for 61521", { exact: true }),
    ).toBeVisible();

    // ensure there is no additional unformatted axis (non-exact = substring,
    // tolerant of ECharts axis-text whitespace so absence is non-vacuous).
    await expect(dialog.getByText("0.06")).toHaveCount(0);
    await expect(dialog.getByText("0.05")).toHaveCount(0);
    await expect(dialog.getByText("0.04")).toHaveCount(0);
  });
});

test.describe("issue 65908 (UXW-2293)", () => {
  const dateParameters = {
    default: "2030-01-01~",
    id: "d3b78b27",
    name: "Date Filter",
    slug: "date_filter",
    type: "date/all-options",
  };

  interface CreateDashcardProps {
    index: number;
    questionId: number;
    hideEmptyResults: boolean;
    withParameterMappings: boolean;
  }
  function createDashcard({
    index,
    questionId,
    hideEmptyResults,
    withParameterMappings,
  }: CreateDashcardProps): Record<string, unknown> {
    const cardHeightInRows = 10;

    return {
      col: 0,
      row: cardHeightInRows * index,
      size_x: 24,
      size_y: cardHeightInRows,
      card_id: questionId,
      visualization_settings: {
        "card.hide_empty": hideEmptyResults,
      },
      parameter_mappings: withParameterMappings
        ? [
            {
              parameter_id: dateParameters.id,
              card_id: questionId,
              target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
            },
          ]
        : undefined,
    };
  }

  let dashboardId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const dashboardDetails = {
      name: "Dashboard with empty result cards",
      parameters: [dateParameters],
    };

    const questionDetails = {
      name: "Orders question",
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
    };

    const { dashboard, questions } = await createDashboardWithQuestions(mb.api, {
      dashboardDetails,
      questions: [questionDetails],
    });

    const [question] = questions;
    await updateDashboardCards(mb.api, {
      dashboard_id: dashboard.id,
      cards: [
        createDashcard({
          index: 0,
          questionId: question.id,
          hideEmptyResults: true,
          withParameterMappings: true,
        }),
        createDashcard({
          index: 1,
          questionId: question.id,
          hideEmptyResults: true,
          withParameterMappings: true,
        }),
        createDashcard({
          index: 2,
          questionId: question.id,
          hideEmptyResults: true,
          withParameterMappings: true,
        }),
        createDashcard({
          index: 3,
          questionId: question.id,
          hideEmptyResults: false,
          withParameterMappings: false,
        }),
      ],
    });
    dashboardId = dashboard.id;
  });

  test("should not take into account the height of cards with no results when calculating dashboard height", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, dashboardId);

    await expect(
      await findByDisplayValue(
        page.locator("body"),
        "Dashboard with empty result cards",
      ),
    ).toBeVisible();

    const card = getDashboardCard(page, 0);
    await expect(card.getByText("Orders question", { exact: true })).toBeVisible();
    // Checks for the subtotal value from the first row
    await expect(card.getByText("37.65", { exact: true })).toBeVisible();

    // 4 cards take about 2000px in height, so only 1 card should definitely
    // take less than 1000px
    const scrollHeight = await page
      .getByRole("main")
      .first()
      .evaluate((el) => el.scrollHeight);
    expect(scrollHeight).toBeLessThan(1000);
  });
});

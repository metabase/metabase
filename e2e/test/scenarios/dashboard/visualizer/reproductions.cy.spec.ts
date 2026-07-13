import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  DashboardDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import {
  ORDERS_COUNT_BY_CREATED_AT,
  PRODUCTS_COUNT_BY_CREATED_AT,
  createVisualizerDashcardWithTimeseriesBreakout,
} from "e2e/support/test-visualizer-data";
import type { DashboardCard, Parameter } from "metabase-types/api";

const { H } = cy;
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 61521", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("should preserve column settings when use visualizer (metabase#61521)", () => {
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
              [
                "sum",
                [
                  "field" as const,
                  ORDERS.TAX,
                  {
                    "base-type": "type/Float",
                  },
                ],
              ],
              [
                "sum",
                [
                  "field" as const,
                  ORDERS.SUBTOTAL,
                  {
                    "base-type": "type/Float",
                  },
                ],
              ],
            ],
            {
              name: "Tax over Sub",
              "display-name": "Tax over Sub",
            },
          ],
        ],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            {
              "base-type": "type/DateTime",
              "temporal-unit": "month",
            },
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
              [
                "sum",
                [
                  "field",
                  ORDERS.TAX,
                  {
                    "base-type": "type/Float",
                  },
                ],
              ],
              [
                "sum",
                [
                  "field",
                  ORDERS.TOTAL,
                  {
                    "base-type": "type/Float",
                  },
                ],
              ],
            ],
            {
              name: "Tax over Total",
              "display-name": "Tax over Total",
            },
          ],
        ],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            {
              "base-type": "type/DateTime",
              "temporal-unit": "month",
            },
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

    H.createQuestion(questionBDetails as unknown as StructuredQuestionDetails);

    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      H.createQuestionAndAddToDashboard(
        questionADetails as unknown as StructuredQuestionDetails,
        dashboardId,
      );

      cy.visit(`/dashboard/${dashboardId}`);
    });

    H.editDashboard();
    H.getDashboardCard(0)
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Visualize another way")
      .click();

    H.modal().within(() => {
      H.switchToAddMoreData();

      cy.findByText("Question B for 61521")
        .closest("[data-testid='swap-dataset-button']")
        .should("not.have.attr", "aria-pressed", "true")
        .click({ force: true });

      cy.wait("@cardQuery");

      cy.findByLabelText("Legend")
        .findByText("Question B for 61521")
        .should("exist");

      // ensure there is no additional unformatted axis
      cy.findByText("0.06").should("not.exist");
      cy.findByText("0.05").should("not.exist");
      cy.findByText("0.04").should("not.exist");
    });
  });
});

describe("issue 65908 (UXW-2293)", () => {
  const dateParameters: Parameter = {
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
  }: CreateDashcardProps): Partial<DashboardCard> {
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

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    const dashboardDetails = {
      name: "Dashboard with empty result cards",
      parameters: [dateParameters],
    } satisfies DashboardDetails;

    const questionDetails: StructuredQuestionDetails = {
      name: "Orders question",
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
    };

    H.createDashboardWithQuestions({
      dashboardDetails,
      questions: [questionDetails],
    }).then(({ dashboard, questions }) => {
      const [question] = questions;
      H.updateDashboardCards({
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
      cy.wrap(dashboard.id).as("dashboardId");
    });
  });

  it("should not take into account the height of cards with no results when calculating dashboard height", () => {
    cy.get("@dashboardId").then((dashboardId: any) => {
      H.visitDashboard(dashboardId);

      cy.findByDisplayValue("Dashboard with empty result cards").should(
        "be.visible",
      );

      H.getDashboardCard().within(() => {
        cy.findByText("Orders question").should("be.visible");
        cy.log("Checks for the subtotal value from the first row");
        cy.findByText("37.65").should("be.visible");
      });

      cy.findByRole("main").should(($main) => {
        // 4 cards take about 2000px in height, so only 1 card should definitely take less than 1000px
        expect($main[0].scrollHeight).to.be.lessThan(1000);
      });
    });
  });
});

describe("issue 76819 (UXW-4679)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("saves a visualizer dashcard's axis edit even when the source-card refetch is slow (metabase#76819)", () => {
    // Build a renderable combo visualizer dashcard directly via the API.
    H.createQuestion(ORDERS_COUNT_BY_CREATED_AT).then(
      ({ body: { id: ordersCardId } }) => {
        H.createQuestion(PRODUCTS_COUNT_BY_CREATED_AT).then(
          ({ body: { id: productsCardId } }) => {
            H.createDashboard().then(({ body: { id: dashboardId } }) => {
              cy.wrap(dashboardId).as("dashboardId");
              cy.request("PUT", `/api/dashboard/${dashboardId}`, {
                dashcards: [
                  createVisualizerDashcardWithTimeseriesBreakout(
                    ordersCardId,
                    productsCardId,
                    { id: -1, col: 0, row: 0, size_x: 12, size_y: 8 },
                  ),
                ],
              });
              H.visitDashboard(dashboardId);
            });
          },
        );
      },
    );

    H.editDashboard();
    H.showDashcardVisualizerModalSettings(0, { isVisualizerCard: true });
    H.modal().within(() => {
      cy.findByRole("radio", { name: /axes/i }).click({ force: true });
      cy.findByText("Auto y-axis range").click();
    });

    // Slow the source-card refetch that replaceCardWithVisualization awaits before
    // committing the edit, so the async-commit window is wide and deterministic.
    cy.intercept("GET", "/api/card/*", (req) => {
      req.on("response", (res) => {
        res.setDelay(1000);
      });
    }).as("slowGetCard");
    cy.intercept("PUT", "/api/dashboard/*").as("saveDashboardPut");

    // Save the modal edit and save the dashboard immediately. With the fix the Save button shows a loading state and
    // the modal stays open until the commit lands; without it it closes early.
    H.saveDashcardVisualizerModal({ mode: "update" });
    H.dashboardSaveButton().click();

    //Ensure that dashboard actually updated
    cy.wait("@saveDashboardPut");
    cy.findByTestId("edit-bar").should("not.exist");
    cy.get<number>("@dashboardId").then((id) => {
      cy.request("GET", `/api/dashboard/${id}`).then(({ body }) => {
        const settings =
          body.dashcards[0]?.visualization_settings?.visualization?.settings ??
          {};
        expect(
          settings["graph.y_axis.auto_range"],
          "axis edit should persist on the visualizer dashcard",
        ).to.equal(false);
      });
    });
  });
});

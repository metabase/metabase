const { H } = cy;

import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  SCALAR_CARD,
  STEP_COLUMN_CARD,
  VIEWS_COLUMN_CARD,
} from "e2e/support/test-visualizer-data";

describe("scenarios > visualizer > funnels", () => {
  beforeEach(() => {
    H.restore();

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.signInAsNormalUser();
  });

  it("should build a funnel", () => {
    H.createNativeQuestion(STEP_COLUMN_CARD);
    H.createNativeQuestion(VIEWS_COLUMN_CARD);

    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();

    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(STEP_COLUMN_CARD.name);

    H.modal().within(() => {
      H.selectVisualization("funnel");

      cy.button("Add more data").click();
      H.selectDataset(VIEWS_COLUMN_CARD.name);
      cy.button("Done").click();

      H.assertDataSourceColumnSelected(STEP_COLUMN_CARD.name, "Step");
      H.assertDataSourceColumnSelected(VIEWS_COLUMN_CARD.name, "Views");

      H.verticalWell().within(() => {
        cy.findByText("Views").should("exist");
        cy.findAllByTestId("well-item").should("have.length", 1);
      });
      H.horizontalWell().within(() => {
        cy.findByText("Step").should("exist");
        cy.findByText("Checkout page").should("exist");
        cy.findByText("Landing page").should("exist");
        cy.findByText("Payment done page").should("exist");
        cy.findAllByTestId("well-item").should("have.length", 4);
      });

      // Remove a column from the data manager
      H.dataSourceColumn(STEP_COLUMN_CARD.name, "Step")
        .findByLabelText("Remove")
        .click();
      H.assertDataSourceColumnSelected(STEP_COLUMN_CARD.name, "Step", false);
      H.verticalWell().within(() => {
        cy.findByText("Views").should("exist");
        cy.findAllByTestId("well-item").should("have.length", 1);
      });
      H.horizontalWell().within(() => {
        cy.findByText("(empty)").should("exist");
        cy.findAllByTestId("well-item").should("have.length", 1);
      });

      // Add a column back
      H.dataSourceColumn(STEP_COLUMN_CARD.name, "Step").click();
      H.assertDataSourceColumnSelected(STEP_COLUMN_CARD.name, "Step");
      H.verticalWell().within(() => {
        cy.findByText("Views").should("exist");
        cy.findAllByTestId("well-item").should("have.length", 1);
      });
      H.horizontalWell().within(() => {
        cy.findByText("Step").should("exist");
        cy.findAllByTestId("well-item").should("have.length", 4);
      });

      // Remove the metric column from the well
      H.verticalWell()
        .findByTestId("well-item")
        .findByLabelText("Remove")
        .click();
      H.assertDataSourceColumnSelected(VIEWS_COLUMN_CARD.name, "Views", false);
      H.verticalWell().findAllByTestId("well-item").should("have.length", 0);
      H.horizontalWell().findAllByTestId("well-item").should("have.length", 4);

      // Remove the dimension column from the well
      H.horizontalWell()
        .findAllByTestId("well-item")
        .first()
        .findByLabelText("Remove")
        .click();
      H.assertDataSourceColumnSelected(STEP_COLUMN_CARD.name, "Step", false);
      H.verticalWell().findAllByTestId("well-item").should("have.length", 0);
      H.horizontalWell().findAllByTestId("well-item").should("have.length", 0);

      // Rebuild the funnel
      H.dataSourceColumn(STEP_COLUMN_CARD.name, "Step").click();
      H.dataSourceColumn(VIEWS_COLUMN_CARD.name, "Views").click();
      H.assertDataSourceColumnSelected(STEP_COLUMN_CARD.name, "Step");
      H.assertDataSourceColumnSelected(VIEWS_COLUMN_CARD.name, "Views");
      H.verticalWell().within(() => {
        cy.findByText("Views").should("exist");
        cy.findAllByTestId("well-item").should("have.length", 1);
      });
      H.horizontalWell().within(() => {
        cy.findByText("Step").should("exist");
        cy.findAllByTestId("well-item").should("have.length", 4);
      });

      // Remove a data source
      H.removeDataSource(VIEWS_COLUMN_CARD.name);
      H.dataImporter().within(() => {
        cy.findByText(VIEWS_COLUMN_CARD.name).should("not.exist");
        cy.findByText("Views").should("not.exist");
      });
      H.verticalWell().findAllByTestId("well-item").should("have.length", 0);
      H.horizontalWell().findAllByTestId("well-item").should("have.length", 4);
    });
  });

  it("should build a funnel of several scalar cards (VIZ-678)", () => {
    const { LANDING_PAGE_VIEWS, CHECKOUT_PAGE_VIEWS, PAYMENT_DONE_PAGE_VIEWS } =
      SCALAR_CARD;

    H.createNativeQuestion(LANDING_PAGE_VIEWS);
    H.createNativeQuestion(CHECKOUT_PAGE_VIEWS);
    H.createNativeQuestion(PAYMENT_DONE_PAGE_VIEWS);

    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();

    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(LANDING_PAGE_VIEWS.name);

    H.modal().within(() => {
      H.switchToAddMoreData();
      H.selectDataset(CHECKOUT_PAGE_VIEWS.name);
      H.selectDataset(PAYMENT_DONE_PAGE_VIEWS.name);

      H.verticalWell().within(() => {
        cy.findByText("METRIC").should("not.exist");
      });
      H.horizontalWell().within(() => {
        cy.findByText("DIMENSION").should("not.exist");
        cy.findByText(LANDING_PAGE_VIEWS.name).should("exist");
        cy.findByText(CHECKOUT_PAGE_VIEWS.name).should("exist");
        cy.findByText(PAYMENT_DONE_PAGE_VIEWS.name).should("exist");
        cy.findAllByTestId("well-item").should("have.length", 3);
      });

      H.switchToColumnsList();

      H.assertDataSourceColumnSelected(LANDING_PAGE_VIEWS.name, "views");
      H.assertDataSourceColumnSelected(CHECKOUT_PAGE_VIEWS.name, "views");
      H.assertDataSourceColumnSelected(PAYMENT_DONE_PAGE_VIEWS.name, "views");

      // Remove a column from the data manager
      H.deselectColumnFromColumnsList(CHECKOUT_PAGE_VIEWS.name, "views");
      H.assertDataSourceColumnSelected(
        CHECKOUT_PAGE_VIEWS.name,
        "views",
        false,
      );
      H.verticalWell().within(() => {
        cy.findByText("METRIC").should("not.exist");
      });
      H.horizontalWell().within(() => {
        cy.findByText("DIMENSION").should("not.exist");
        cy.findAllByTestId("well-item").should("have.length", 2);
      });

      // Add a column back
      H.selectColumnFromColumnsList(CHECKOUT_PAGE_VIEWS.name, "views");
      H.assertDataSourceColumnSelected(CHECKOUT_PAGE_VIEWS.name, "views");
      H.verticalWell().within(() => {
        cy.findByText("METRIC").should("not.exist");
      });
      H.horizontalWell().within(() => {
        cy.findByText("DIMENSION").should("not.exist");
        cy.findAllByTestId("well-item").should("have.length", 3);
      });

      H.deselectColumnFromColumnsList(LANDING_PAGE_VIEWS.name, "views");
      H.deselectColumnFromColumnsList(CHECKOUT_PAGE_VIEWS.name, "views");
      H.deselectColumnFromColumnsList(PAYMENT_DONE_PAGE_VIEWS.name, "views");

      H.verticalWell().findAllByTestId("well-item").should("have.length", 0);
      H.horizontalWell().findAllByTestId("well-item").should("have.length", 0);

      // Rebuild the funnel
      H.selectColumnFromColumnsList(LANDING_PAGE_VIEWS.name, "views");
      H.selectColumnFromColumnsList(CHECKOUT_PAGE_VIEWS.name, "views");
      H.selectColumnFromColumnsList(PAYMENT_DONE_PAGE_VIEWS.name, "views");

      H.assertDataSourceColumnSelected(LANDING_PAGE_VIEWS.name, "views");
      H.assertDataSourceColumnSelected(CHECKOUT_PAGE_VIEWS.name, "views");
      H.assertDataSourceColumnSelected(PAYMENT_DONE_PAGE_VIEWS.name, "views");

      H.verticalWell().within(() => {
        cy.findByText("METRIC").should("not.exist");
      });
      H.horizontalWell().within(() => {
        cy.findByText("DIMENSION").should("not.exist");
        cy.findAllByTestId("well-item").should("have.length", 3);
      });
    });
  });

  it("should open the underlying question when clicking the title of a single-question visualizer funnel (metabase#67980)", () => {
    const visualizerTitle = "UXW-2692 Visualizer Funnel";

    H.createNativeQuestion({
      name: "UXW-2692 Funnel Base",
      display: "funnel",
      native: {
        query: `
          SELECT 73 AS "Val", 'Downloads' AS "Step"
          UNION ALL
          SELECT 52 AS "Val", 'Followers' AS "Step"
        `,
      },
      visualization_settings: {
        "funnel.metric": "Val",
        "funnel.dimension": "Step",
      },
    }).then(({ body: { id: questionId } }) => {
      H.createDashboard({ name: "UXW-2692 Dashboard" }).then(
        ({ body: { id: dashboardId } }) => {
          cy.request("PUT", `/api/dashboard/${dashboardId}`, {
            dashcards: [
              {
                id: -1,
                card_id: questionId,
                dashboard_tab_id: null,
                row: 0,
                col: 0,
                size_x: 12,
                size_y: 8,
                visualization_settings: {
                  visualization: {
                    display: "funnel",
                    columnValuesMapping: {
                      COLUMN_1: [
                        {
                          name: "COLUMN_1",
                          originalName: "Step",
                          sourceId: `card:${questionId}`,
                        },
                      ],
                      COLUMN_2: [
                        {
                          name: "COLUMN_2",
                          originalName: "Val",
                          sourceId: `card:${questionId}`,
                        },
                      ],
                    },
                    settings: {
                      "card.title": visualizerTitle,
                      "funnel.metric": "COLUMN_2",
                      "funnel.dimension": "COLUMN_1",
                      "funnel.rows": [
                        {
                          key: "Followers",
                          name: "Followers",
                          enabled: true,
                        },
                        {
                          key: "Downloads",
                          name: "Downloads",
                          enabled: true,
                        },
                      ],
                    },
                  },
                },
              },
            ],
          });

          H.visitDashboard(dashboardId);
          H.getDashboardCard(0).findByTestId("funnel-chart").should("exist");

          H.clickOnCardTitle(0);

          cy.location("pathname").should("contain", `/question/${questionId}`);
        },
      );
    });
  });
});

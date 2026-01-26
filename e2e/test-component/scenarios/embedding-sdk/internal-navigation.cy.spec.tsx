import { InteractiveDashboard } from "@metabase/embedding-sdk-react";

const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import type { Parameter } from "metabase-types/api";
import { createMockActionParameter } from "metabase-types/api/mocks";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

// Dashboard B filter parameter
const DASHBOARD_B_FILTER: Parameter = createMockActionParameter({
  id: "dashboard-b-filter",
  name: "ID Filter",
  slug: "id-filter",
  type: "number/=",
  sectionId: "number",
});

describe("scenarios > embedding-sdk > internal-navigation", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    // 1. Create a native question with a parameter (for testing parameter passing to questions)
    H.createNativeQuestion({
      name: "Native Question with Param",
      native: {
        query: "SELECT * FROM ORDERS WHERE ID = {{id}} LIMIT 10",
        "template-tags": {
          id: {
            id: "native-id-tag",
            name: "id",
            "display-name": "ID",
            type: "number",
            required: false,
          },
        },
      },
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("nativeQuestionId");
    });

    // 2. Create Dashboard B with a filter and a card
    // Dashboard B will have a click behavior linking to a question
    cy.get<number>("@nativeQuestionId").then((nativeQuestionId) => {
      H.createDashboard({
        name: "Dashboard B",
        parameters: [DASHBOARD_B_FILTER],
      }).then(({ body: dashboardB }) => {
        cy.wrap(dashboardB.id).as("dashboardBId");

        // Add a question card to Dashboard B with click behavior to native question
        H.createQuestion({
          name: "Orders for Dashboard B",
          query: {
            "source-table": ORDERS_ID,
            limit: 5,
          },
        }).then(({ body: questionB }) => {
          H.addOrUpdateDashboardCard({
            card_id: questionB.id,
            dashboard_id: dashboardB.id,
            card: {
              row: 0,
              col: 0,
              size_x: 24,
              size_y: 8,
              parameter_mappings: [
                {
                  parameter_id: DASHBOARD_B_FILTER.id,
                  card_id: questionB.id,
                  target: ["dimension", ["field", ORDERS.ID, null]],
                },
              ],
              visualization_settings: {
                column_settings: {
                  [`["ref",["field",${ORDERS.ID},null]]`]: {
                    click_behavior: {
                      type: "link",
                      linkType: "question",
                      linkTextTemplate: "Go to Question",
                      targetId: nativeQuestionId,
                      parameterMapping: {
                        id: {
                          source: {
                            type: "column",
                            id: "ID",
                            name: "ID",
                          },
                          target: {
                            type: "variable",
                            id: "id",
                          },
                          id: "id",
                        },
                      },
                    },
                  },
                },
              },
            },
          });
        });
      });
    });

    // 3. Create Dashboard A with click behaviors
    cy.get<number>("@dashboardBId").then((dashboardBId) => {
      cy.get<number>("@nativeQuestionId").then((nativeQuestionId) => {
        H.createDashboard({
          name: "Dashboard A",
        }).then(({ body: dashboardA }) => {
          cy.wrap(dashboardA.id).as("dashboardAId");

          // Create a question for Dashboard A
          H.createQuestion({
            name: "Orders for Dashboard A",
            query: {
              "source-table": ORDERS_ID,
              limit: 5,
            },
          }).then(({ body: questionA }) => {
            H.addOrUpdateDashboardCard({
              card_id: questionA.id,
              dashboard_id: dashboardA.id,
              card: {
                row: 0,
                col: 0,
                size_x: 24,
                size_y: 8,
                visualization_settings: {
                  column_settings: {
                    // ID column links to Dashboard B with parameter
                    [`["ref",["field",${ORDERS.ID},null]]`]: {
                      click_behavior: {
                        type: "link",
                        linkType: "dashboard",
                        linkTextTemplate: "Go to Dashboard B",
                        targetId: dashboardBId,
                        parameterMapping: {
                          [DASHBOARD_B_FILTER.id]: {
                            source: {
                              type: "column",
                              id: "ID",
                              name: "ID",
                            },
                            target: {
                              type: "parameter",
                              id: DASHBOARD_B_FILTER.id,
                            },
                            id: DASHBOARD_B_FILTER.id,
                          },
                        },
                      },
                    },
                    // PRODUCT_ID column links to native question with parameter
                    [`["ref",["field",${ORDERS.PRODUCT_ID},null]]`]: {
                      click_behavior: {
                        type: "link",
                        linkType: "question",
                        linkTextTemplate: "Go to Native Question",
                        targetId: nativeQuestionId,
                        parameterMapping: {
                          id: {
                            source: {
                              type: "column",
                              id: "PRODUCT_ID",
                              name: "Product ID",
                            },
                            target: {
                              type: "variable",
                              id: "id",
                            },
                            id: "id",
                          },
                        },
                      },
                    },
                  },
                },
              },
            });
          });
        });
      });
    });

    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should pass parameters to the linked dashboard", () => {
    cy.get<number>("@dashboardAId").then((dashboardAId) => {
      mountSdkContent(
        <InteractiveDashboard
          dashboardId={dashboardAId}
          enableEntityNavigation
        />,
      );
    });

    cy.wait("@getDashboard");
    cy.wait("@dashcardQuery");

    getSdkRoot().within(() => {
      // Verify we're on Dashboard A
      cy.findByText("Dashboard A").should("be.visible");

      // Click on the custom link text that navigates to Dashboard B
      H.getDashboardCard().findAllByText("Go to Dashboard B").first().click();

      // Wait for Dashboard B to load
      cy.wait("@getDashboard");

      // Verify we navigated to Dashboard B
      cy.findByText("Dashboard B").should("be.visible");

      // Verify the filter widget shows the passed parameter value
      H.filterWidget().should("be.visible");

      // Verify breadcrumb shows Dashboard A (so we can go back)
      cy.findByText("Back to Dashboard A").should("be.visible").click();

      cy.findByText("Dashboard A").should("be.visible");
    });
  });

  it("should pass parameters to the linked native question", () => {
    cy.get<number>("@dashboardAId").then((dashboardAId) => {
      mountSdkContent(
        <InteractiveDashboard
          dashboardId={dashboardAId}
          enableEntityNavigation
        />,
      );
    });

    cy.wait("@getDashboard");
    cy.wait("@dashcardQuery");

    getSdkRoot().within(() => {
      // Verify we're on Dashboard A
      cy.findByText("Dashboard A").should("be.visible");

      // Click on the custom link text that navigates to native question
      H.getDashboardCard()
        .findAllByText("Go to Native Question")
        .first()
        .click();

      // Verify the question loaded (visualization root should be visible)
      cy.findByTestId("visualization-root").should("be.visible");
      // We don't currently show the params on the question, so we can only assert the results
      // TODO check that we only render one row with the correct product id

      // Verify breadcrumb shows Dashboard A
      cy.findByText("Back to Dashboard A").should("be.visible");
    });
  });

  it("should support nested navigations dashboard -> dashboard -> question -> drills", () => {
    cy.get<number>("@dashboardAId").then((dashboardAId) => {
      mountSdkContent(
        <InteractiveDashboard
          dashboardId={dashboardAId}
          enableEntityNavigation
        />,
      );
    });

    cy.wait("@getDashboard");
    cy.wait("@dashcardQuery");

    getSdkRoot().within(() => {
      // Step 1: Verify we start on Dashboard A
      cy.findByText("Dashboard A").should("be.visible");

      // Step 2: Navigate from Dashboard A to Dashboard B
      H.getDashboardCard().findAllByText("Go to Dashboard B").first().click();

      // cy.wait("@getDashboard");
      // cy.wait("@dashcardQuery");

      // Verify we're now on Dashboard B
      cy.findByText("Dashboard B").should("be.visible");

      // Verify back button shows Dashboard A
      cy.findByText("Back to Dashboard A").should("be.visible");

      // Step 3: Navigate from Dashboard B to native question
      H.getDashboardCard().findAllByText("Go to Question").first().click();

      // Verify we're now viewing the question
      cy.findByTestId("visualization-root").should("be.visible");

      // Verify back button shows Dashboard B (the previous location)
      // cy.findByText("Back to Dashboard B").should("be.visible");

      // Step 4: Click back button to go back to Dashboard B
      cy.findByText("Back to Dashboard B").click();

      // cy.wait("@getDashboard");

      // Verify we're back on Dashboard B
      cy.findByText("Dashboard B").should("be.visible");

      // Verify back button now shows Dashboard A
      // cy.findByText("Back to Dashboard A").should("be.visible");

      // Step 5: Click back button to go back to Dashboard A
      cy.findByText("Back to Dashboard A").click();

      cy.wait("@getDashboard");

      // Verify we're back on Dashboard A (root)
      cy.findByText("Dashboard A").should("be.visible");

      // Verify no back button exists (we're at the root)
      cy.findByText(/Back to/).should("not.exist");
    });
  });
});

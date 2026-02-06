import {
  InteractiveDashboard,
  InteractiveQuestion,
} from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import type { Parameter } from "metabase-types/api";
import { createMockActionParameter } from "metabase-types/api/mocks";

const { H } = cy;

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
  describe("dashboard", () => {
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

      // 2. Create a regular question that supports drilling (for testing drill navigation)
      H.createQuestion({
        name: "Drillable Question",
        query: {
          "source-table": ORDERS_ID,
          limit: 10,
        },
      }).then(({ body: drillableQuestion }) => {
        cy.wrap(drillableQuestion.id).as("drillableQuestionId");
      });

      // 3. Create Dashboard B with a filter and a card
      // Dashboard B will have a click behavior linking to a question
      cy.get<number>("@drillableQuestionId").then((drillableQuestionId) => {
        H.createDashboard({
          name: "Dashboard B",
          parameters: [DASHBOARD_B_FILTER],
        }).then(({ body: dashboardB }) => {
          cy.wrap(dashboardB.id).as("dashboardBId");

          // Add a question card to Dashboard B with click behavior to drillable question
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
                        targetId: drillableQuestionId,
                        parameterMapping: {},
                      },
                    },
                  },
                },
              },
            });
          });
        });
      });

      // 4. Create Dashboard A with click behaviors
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

    it("should navigate to the question when clicking on the dashcard title", () => {
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

        // Click on the dashcard title to navigate to the question
        H.getDashboardCard()
          .findByText("Orders for Dashboard A")
          .should("be.visible")
          .click();

        // Verify the question loaded (visualization root should be visible)
        cy.findByTestId("visualization-root").should("be.visible");

        // Verify breadcrumb shows Dashboard A
        cy.findByText("Back to Dashboard A").should("be.visible");
        // Go back to Dashboard A
        cy.findByText("Back to Dashboard A").click();

        // Verify we're back on Dashboard A
        cy.findByText("Dashboard A").should("be.visible");

        // Verify no back button exists (we're at the root)
        cy.findByText(/Back to/).should("not.exist");
      });
    });

    it("should allow drilling directly from the initial dashboard and show the drilled question", () => {
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

        // Click on a User ID cell (column without custom click behavior) to trigger drill menu
        // The ID and Product ID columns have custom click behaviors, so we use User ID
        H.getDashboardCard()
          .findByTestId("visualization-root")
          .findAllByRole("gridcell", { name: "1" })
          .first()
          .click();

        // Click on drill option to view orders for this user
        H.popover().findByText("View this User's Orders").click();

        // Verify the drilled question is now shown (not the dashboard)
        cy.findByTestId("visualization-root").should("be.visible");

        // The dashboard title should no longer be visible since we're viewing the drill result
        cy.findByText("Dashboard A").should("not.exist");

        // Verify back button shows Dashboard A
        cy.findByText("Back to Dashboard A").should("be.visible");

        // Click back to return to the dashboard
        cy.findByText("Back to Dashboard A").click();

        // Verify we're back on Dashboard A
        cy.findByText("Dashboard A").should("be.visible");

        // Verify no back button exists (we're at the root)
        cy.findByText(/Back to/).should("not.exist");
      });
    });

    it("should support go to  question -> drill -> drill -> back", () => {
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

        // Step 2: Navigate to question by clicking on dashcard title
        H.getDashboardCard()
          .findByText("Orders for Dashboard A")
          .should("be.visible")
          .click();

        // Verify we're now viewing the question
        cy.findByTestId("visualization-root").should("be.visible");
        cy.findByText("Back to Dashboard A").should("be.visible");

        // Step 3: First drill - click on Product ID cell
        H.tableInteractiveBody().findByRole("gridcell", { name: "14" }).click();
        H.popover().findByText("View this Product's Orders").click();

        // Verify drill happened - back button should show the question name
        cy.findByText("Back to Orders for Dashboard A").should("be.visible");

        // Step 4: Second drill
        H.tableInteractiveBody().findAllByText("2.07").first().click();
        H.popover().findByText("<").click();

        // Back button should still show the original question
        cy.findByText("Back to Orders for Dashboard A").should("be.visible");

        // Step 5: One back click should undo BOTH drills and return to the question
        cy.findByText("Back to Orders for Dashboard A").click();

        // Verify we're back on the original question (not drill result)
        cy.findByTestId("visualization-root").should("be.visible");
        cy.findByText("Back to Dashboard A").should("be.visible");

        // Step 6: Another back click should return to the dashboard
        cy.findByText("Back to Dashboard A").click();

        // Verify we're back on Dashboard A
        cy.findByText("Dashboard A").should("be.visible");

        // Verify no back button exists (we're at the root)
        cy.findByText(/Back to/).should("not.exist");
      });
    });

    it("should support dashboard -> drill -> drill -> back directly to dashboard", () => {
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

        // Step 2: First drill directly from dashboard (click on User ID cell - no custom click behavior)
        H.getDashboardCard()
          .findByTestId("visualization-root")
          .findAllByRole("gridcell", { name: "1" })
          .first()
          .click();

        H.popover().findByText("View this User's Orders").click();

        // Verify we're now on drilled question
        cy.findByTestId("visualization-root").should("be.visible");
        cy.findByText("Dashboard A").should("not.exist");
        cy.findByText("Back to Dashboard A").should("be.visible");

        // Step 3: Second drill on the drill result
        H.tableInteractiveBody().findAllByText("2.07").first().click();
        H.popover().findByText("<").click();

        // Back button should still show Dashboard A (drills don't create navigation entries)
        cy.findByText("Back to Dashboard A").should("be.visible");

        // Step 4: One back click should go directly back to Dashboard A
        cy.findByText("Back to Dashboard A").click();

        // Verify we're back on Dashboard A
        cy.findByText("Dashboard A").should("be.visible");

        // Verify no back button exists (we're at the root)
        cy.findByText(/Back to/).should("not.exist");
      });
    });

    it("should forward `withDownloads` prop from the dashboard to the question", () => {
      cy.get<number>("@dashboardAId").then((dashboardAId) => {
        mountSdkContent(
          <InteractiveDashboard
            dashboardId={dashboardAId}
            enableEntityNavigation
            withDownloads
          />,
        );
      });

      cy.wait("@dashcardQuery");

      getSdkRoot().within(() => {
        H.getDashboardCard()
          .findAllByText("Go to Native Question")
          .first()
          .click();

        cy.findByTestId("visualization-root").should("be.visible");

        cy.findByTestId("question-download-widget-button").should("be.visible");
      });
    });

    it("should support nested navigations dashboard -> dashboard -> question -> multiple drills -> back through all", () => {
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

        // Step 2: Navigate from Dashboard A to Dashboard B via click behavior
        H.getDashboardCard().findAllByText("Go to Dashboard B").first().click();

        // Verify we're now on Dashboard B
        cy.findByText("Dashboard B").should("be.visible");

        // Verify back button shows Dashboard A
        cy.findByText("Back to Dashboard A").should("be.visible");

        // Step 3: Navigate from Dashboard B to question via click behavior
        H.getDashboardCard().findAllByText("Go to Question").first().click();

        // Verify we're now viewing the question
        cy.findByTestId("visualization-root").should("be.visible");

        // Verify back button shows Dashboard B
        cy.findByText("Back to Dashboard B").should("be.visible");

        // We'll later verify this will be hidden by the drill
        H.tableInteractiveBody().findByText("123").should("be.visible");

        // Step 4: Perform first drill on the question (click on Product ID to drill)

        H.tableInteractiveBody().findByRole("gridcell", { name: "14" }).click();
        H.popover().findByText("View this Product's Orders").click();

        H.tableInteractiveBody().findByText("123").should("not.exist");

        // Verify we're now on an adhoc question (drill result)
        cy.findByTestId("visualization-root").should("be.visible");

        // After drilling, back button should show "Drillable Question"
        cy.findByText("Back to Drillable Question").should("be.visible");

        // We'll later verify this will be hidden by the drill
        H.tableInteractiveBody().findByText("2.26").should("be.visible");

        // Step 5: Perform second drill
        H.tableInteractiveBody().findAllByText("2.07").first().click();

        H.popover().findByText("<").click();

        // Verify drill really happened
        H.tableInteractiveBody().findByText("2.26").should("not.exist");

        // Back button should still show the original question
        cy.findByText("Back to Drillable Question").should("be.visible");

        H.tableInteractiveBody()
          .findAllByText("25.1")
          .first()
          .should("be.visible");

        // Step 6: Perform third drill
        H.tableInteractiveBody().findAllByText("37.65").first().click();

        H.popover().findByText("=").click();

        H.tableInteractiveBody().findByText("25.1").should("not.exist");

        // Back button should still show the original question
        cy.findByText("Back to Drillable Question").should("be.visible");

        // Step 7: One back click should revert ALL drills and return to the original question
        cy.findByText("Back to Drillable Question").click();

        // Verify we're back on the question (not an intermediate drill state)
        cy.findByTestId("visualization-root").should("be.visible");
        cy.findByText("Back to Dashboard B").should("be.visible");

        H.tableInteractiveBody().findByText("110.93").should("be.visible");

        // Step 8: Go back to Dashboard B
        cy.findByText("Back to Dashboard B").click();

        // Verify we're back on Dashboard B
        cy.findByText("Dashboard B").should("be.visible");
        cy.findByText("Back to Dashboard A").should("be.visible");

        // Step 9: Go back to Dashboard A
        cy.findByText("Back to Dashboard A").click();

        // Verify we're back on Dashboard A (root)
        cy.findByText("Dashboard A").should("be.visible");

        // Verify no back button exists (we're at the root)
        cy.findByText(/Back to/).should("not.exist");
      });
    });
  });

  describe("question", () => {
    beforeEach(() => {
      signInAsAdminAndEnableEmbeddingSdk();

      // Create a question that supports drilling
      H.createQuestion({
        name: "Orders Question",
        query: {
          "source-table": ORDERS_ID,
          limit: 10,
        },
      }).then(({ body: question }) => {
        cy.wrap(question.id).as("questionId");
      });

      cy.signOut();
      mockAuthProviderAndJwtSignIn();

      cy.intercept("GET", "/api/card/*").as("getCard");
      cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    });

    it("should allow drilling and returning to the original question", () => {
      cy.get<number>("@questionId").then((questionId) => {
        mountSdkContent(<InteractiveQuestion questionId={questionId} />);
      });

      cy.wait("@getCard");
      cy.wait("@cardQuery");

      getSdkRoot().within(() => {
        // Verify original question
        cy.findByText("Orders Question").should("be.visible");

        // No back button initially
        cy.findByText(/Back to/).should("not.exist");

        // Drill - click on PRODUCT_ID cell
        H.tableInteractiveBody().findByRole("gridcell", { name: "14" }).click();
        H.popover().findByText("View this Product's Orders").click();

        // Verify back button appears after drill
        cy.findByText("Back to Orders Question").should("be.visible");

        // Click back
        cy.findByText("Back to Orders Question").click();

        // Should be back at original question
        cy.findByText("Orders Question").should("be.visible");
        cy.findByText(/Back to/).should("not.exist");
      });
    });

    it("should return to original question after nested drills with one back click", () => {
      cy.get<number>("@questionId").then((questionId) => {
        mountSdkContent(<InteractiveQuestion questionId={questionId} />);
      });

      cy.wait("@getCard");
      cy.wait("@cardQuery");

      getSdkRoot().within(() => {
        // Verify original question
        cy.findByText("Orders Question").should("be.visible");

        // No back button initially
        cy.findByText(/Back to/).should("not.exist");

        // First drill - click on PRODUCT_ID cell
        H.tableInteractiveBody().findAllByText("14").first().click();
        H.popover().findByText("View this Product's Orders").click();

        // Verify back button appears after first drill
        cy.findByText("Back to Orders Question").should("be.visible");

        // Second drill
        H.tableInteractiveBody().findAllByText("2.07").first().click();
        H.popover().findByText("<").click();

        cy.findByText("Back to Orders Question").should("be.visible");

        // Third drill
        H.tableInteractiveBody().findAllByText("1.09").first().click();
        H.popover().findByText(">").click();

        cy.findByText("Back to Orders Question").should("be.visible");

        // One button click should return to the original question
        cy.findByText("Back to Orders Question").click();

        // Verify we're back at the original question
        cy.findByText("Orders Question").should("be.visible");
        cy.findByText(/Back to/).should("not.exist");
      });
    });
  });
});

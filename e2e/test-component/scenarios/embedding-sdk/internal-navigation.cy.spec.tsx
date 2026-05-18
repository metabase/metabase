import {
  InteractiveDashboard,
  InteractiveQuestion,
  StaticDashboard,
} from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import type { Parameter } from "metabase-types/api";
import {
  createMockActionParameter,
  createMockDashboardCard,
} from "metabase-types/api/mocks";

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
                size_y: 30,
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

    it("should not be able to navigate when using StaticDashboard even if click behaviors are configured", () => {
      cy.get<number>("@dashboardAId").then((dashboardAId) => {
        mountSdkContent(
          <StaticDashboard
            dashboardId={dashboardAId}
            // this prop isn't actually accepted
            enableEntityNavigation
          />,
        );
      });

      cy.wait("@dashcardQuery");

      getSdkRoot().within(() => {
        // Verify we're on Dashboard A
        cy.findByText("Dashboard A").should("be.visible");

        // Click behavior link text should not be rendered in static mode
        H.getDashboardCard()
          .findByText("Go to Dashboard B")
          .should("not.exist");
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

    it("should keep filters sticky on the navigated dashboard (EMB-1746)", () => {
      cy.get<number>("@dashboardAId").then((dashboardAId) => {
        mountSdkContent(
          <InteractiveDashboard
            dashboardId={dashboardAId}
            enableEntityNavigation
            style={{ height: 400 }}
          />,
        );
      });

      cy.wait("@getDashboard");
      cy.wait("@dashcardQuery");

      getSdkRoot().within(() => {
        cy.findByText("Dashboard A").should("be.visible");

        cy.log("Navigate to Dashboard B via custom click behavior");
        H.getDashboardCard().findAllByText("Go to Dashboard B").first().click();
        cy.wait("@getDashboard");
        cy.findByText("Dashboard B").should("be.visible");
        H.filterWidget().should("be.visible");

        // Pre-fix: nested wrapper dropped user height, so the scroll context
        // was gone and the filter row scrolled off with the content.
        cy.log("Scroll dashboard; filter row must stay pinned at wrapper top");
        cy.findByTestId("sdk-dashboard-styled-wrapper").scrollTo("bottom");

        cy.findByTestId("sdk-dashboard-styled-wrapper").then(($wrapper) => {
          const wrapperTop = $wrapper[0].getBoundingClientRect().top;

          H.filterWidget()
            .should("be.visible")
            .and(($filter) => {
              const filterTop = $filter[0].getBoundingClientRect().top;
              expect(filterTop).to.be.closeTo(wrapperTop, 20);
            });
        });
      });
    });
  });

  describe("same-dashboard navigation (EMB-1714)", () => {
    beforeEach(() => {
      signInAsAdminAndEnableEmbeddingSdk();

      cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
      cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
        "dashcardQuery",
      );
    });

    it("should switch tab and pass parameters when click behavior points to a different tab on the same dashboard", () => {
      const TAB_1 = { id: 1, name: "Tab 1" };
      const TAB_2 = { id: 2, name: "Tab 2" };
      const TAB_3 = { id: 3, name: "Tab 3" };

      const ID_FILTER: Parameter = createMockActionParameter({
        id: "tabbed-id-filter",
        name: "ID Filter",
        slug: "id-filter",
        type: "number/=",
        sectionId: "number",
        isMultiSelect: false,
      });

      const B_TAB_1 = { id: 11, name: "B Tab 1" };
      const B_TAB_2 = { id: 12, name: "B Tab 2" };

      // External dashboard used to exercise the cross-dashboard push +
      // back-restore path (`Go to Dashboard B` click behavior on Tab 3).
      // It is itself tabbed and the Tab 3 click behavior targets its
      // second tab, so navigating there overwrites the global
      // initialDashboardTabId — going back must still restore the source
      // dashboard's own Tab 3.
      H.createQuestion({
        name: "Orders on B Tab 1",
        query: { "source-table": ORDERS_ID, limit: 5 },
      }).then(({ body: bTabOneCard }) => {
        H.createQuestion({
          name: "Orders on B Tab 2",
          query: { "source-table": ORDERS_ID, limit: 5 },
        }).then(({ body: bTabTwoCard }) => {
          H.createDashboardWithTabs({
            name: "Dashboard B",
            tabs: [B_TAB_1, B_TAB_2],
            dashcards: [
              createMockDashboardCard({
                id: -11,
                card_id: bTabOneCard.id,
                dashboard_tab_id: B_TAB_1.id,
                size_x: 12,
                size_y: 6,
              }),
              createMockDashboardCard({
                id: -12,
                card_id: bTabTwoCard.id,
                dashboard_tab_id: B_TAB_2.id,
                size_x: 12,
                size_y: 6,
              }),
            ],
          }).then((externalDashboard) => {
            cy.wrap(externalDashboard.id).as("externalDashboardId");
            cy.wrap((externalDashboard.tabs ?? [])[1].id).as(
              "externalDashboardTab2Id",
            );
          });
        });
      });

      H.createQuestion({
        name: "Orders on Tab 1",
        query: { "source-table": ORDERS_ID, limit: 5 },
      }).then(({ body: tabOneCard }) => {
        H.createQuestion({
          name: "Orders on Tab 2",
          query: { "source-table": ORDERS_ID, limit: 5 },
        }).then(({ body: tabTwoCard }) => {
          H.createQuestion({
            name: "Orders on Tab 3",
            query: { "source-table": ORDERS_ID, limit: 5 },
          }).then(({ body: tabThreeCard }) => {
            H.createDashboardWithTabs({
              name: "Tabbed Dashboard",
              parameters: [ID_FILTER],
              tabs: [TAB_1, TAB_2, TAB_3],
              dashcards: [
                createMockDashboardCard({
                  id: -1,
                  card_id: tabOneCard.id,
                  dashboard_tab_id: TAB_1.id,
                  size_x: 12,
                  size_y: 6,
                }),
                createMockDashboardCard({
                  id: -2,
                  card_id: tabTwoCard.id,
                  dashboard_tab_id: TAB_2.id,
                  size_x: 12,
                  size_y: 6,
                  parameter_mappings: [
                    {
                      parameter_id: ID_FILTER.id,
                      card_id: tabTwoCard.id,
                      target: ["dimension", ["field", ORDERS.ID, null]],
                    },
                  ],
                }),
                createMockDashboardCard({
                  id: -3,
                  card_id: tabThreeCard.id,
                  dashboard_tab_id: TAB_3.id,
                  size_x: 12,
                  size_y: 6,
                  parameter_mappings: [
                    {
                      parameter_id: ID_FILTER.id,
                      card_id: tabThreeCard.id,
                      target: ["dimension", ["field", ORDERS.ID, null]],
                    },
                  ],
                }),
              ],
            }).then((dashboard) => {
              // After creation, tabs and dashcards have real ids; wire the
              // click behavior (with parameter mapping + tabId) using those.
              const tabs = dashboard.tabs ?? [];
              const resolvedTab1 = tabs[0];
              const resolvedTab2 = tabs[1];
              const resolvedTab3 = tabs[2];
              cy.get<number>("@externalDashboardId").then(
                (externalDashboardId) => {
                  cy.get<number>("@externalDashboardTab2Id").then(
                    (externalDashboardTab2Id) => {
                      const updatedDashcards = (dashboard.dashcards ?? []).map(
                        (dashcard) => {
                          if (dashcard.dashboard_tab_id === resolvedTab1.id) {
                            return {
                              ...dashcard,
                              visualization_settings: {
                                column_settings: {
                                  [`["ref",["field",${ORDERS.ID},null]]`]: {
                                    click_behavior: {
                                      type: "link",
                                      linkType: "dashboard",
                                      linkTextTemplate: "Go to Tab 2",
                                      targetId: dashboard.id,
                                      tabId: resolvedTab2.id,
                                      parameterMapping: {
                                        [ID_FILTER.id]: {
                                          source: {
                                            type: "column",
                                            id: "ID",
                                            name: "ID",
                                          },
                                          target: {
                                            type: "parameter",
                                            id: ID_FILTER.id,
                                          },
                                          id: ID_FILTER.id,
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            };
                          }
                          if (dashcard.dashboard_tab_id === resolvedTab3.id) {
                            return {
                              ...dashcard,
                              visualization_settings: {
                                column_settings: {
                                  // ID column on Tab 3 links to Dashboard B's
                                  // second tab (cross-dashboard push to a tabbed
                                  // dashboard) — exercises the back-restore path
                                  // where the destination's tab id must not
                                  // clobber the source dashboard's remembered tab.
                                  [`["ref",["field",${ORDERS.ID},null]]`]: {
                                    click_behavior: {
                                      type: "link",
                                      linkType: "dashboard",
                                      linkTextTemplate: "Go to Dashboard B",
                                      targetId: externalDashboardId,
                                      tabId: externalDashboardTab2Id,
                                      parameterMapping: {},
                                    },
                                  },
                                },
                              },
                            };
                          }
                          return dashcard;
                        },
                      );

                      cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
                        ...dashboard,
                        dashcards: updatedDashcards,
                      });

                      cy.wrap(dashboard.entity_id).as(
                        "tabbedDashboardEntityId",
                      );
                    },
                  );
                },
              );
            });
          });
        });
      });

      cy.signOut();
      mockAuthProviderAndJwtSignIn();

      cy.get<string>("@tabbedDashboardEntityId").then((dashboardId) => {
        mountSdkContent(
          <InteractiveDashboard
            dashboardId={dashboardId}
            enableEntityNavigation
          />,
        );
      });

      cy.wait("@getDashboard");
      cy.wait("@dashcardQuery");

      getSdkRoot().within(() => {
        cy.findByText("Tabbed Dashboard").should("be.visible");
        cy.findByRole("tab", { name: "Tab 1" }).should(
          "have.attr",
          "aria-selected",
          "true",
        );

        // Click the first ID cell on Tab 1 — it has click_behavior to Tab 2
        // with a parameter mapping that should pass the cell's value to the
        // dashboard's ID filter.
        H.getDashboardCard().findAllByText("Go to Tab 2").first().click();

        // Expected: Tab 2 becomes the active tab on the same dashboard.
        // On master this fails: SDK pushes a new dashboard entry, re-mounts on
        // Tab 1, and never honours the click behavior's tabId.
        cy.findByRole("tab", { name: "Tab 2" }).should(
          "have.attr",
          "aria-selected",
          "true",
        );
        cy.findByText("Orders on Tab 2").should("be.visible");

        // The dashboard's ID filter widget should reflect the value passed by
        // the click behavior's parameterMapping.
        H.filterWidget({ name: "ID Filter" }).should("contain.text", "1");

        // No back-button entry should be created for an in-place tab switch.
        cy.findByText(/Back to/).should("not.exist");

        // Manually switch to Tab 3 — diverges from both the default first
        // tab and the click-behavior-pushed Tab 2, so a missing live-capture
        // would fall back to Tab 1 and fail the test.
        cy.findByRole("tab", { name: "Tab 3" }).click();
        cy.findByRole("tab", { name: "Tab 3" }).should(
          "have.attr",
          "aria-selected",
          "true",
        );

        // Manually change the ID filter to a value that differs from the one
        // set by the click behavior. The live filter value should be captured
        // into the stack entry on push so it survives the round trip.
        H.filterWidget({ name: "ID Filter" }).click();
      });
      H.popover().within(() => {
        cy.findByDisplayValue("1").type("{selectall}999");
        cy.button("Update filter").click();
      });
      getSdkRoot().within(() => {
        H.filterWidget({ name: "ID Filter" }).should("contain.text", "999");

        // Navigate away to a different dashboard from Tab 3 (real
        // cross-dashboard push, unmounts the source dashboard so
        // selectedTabId state is lost without the fix).
        H.getDashboardCard().findAllByText("Go to Dashboard B").first().click();
        cy.wait("@getDashboard");
        cy.findByText("Dashboard B").should("be.visible");

        // Dashboard B is itself tabbed; the click behavior targets its
        // second tab, so it should open directly on B Tab 2.
        cy.findByRole("tab", { name: "B Tab 2" }).should(
          "have.attr",
          "aria-selected",
          "true",
        );
        cy.findByText("Orders on B Tab 2").should("be.visible");
        cy.findByText("Back to Tabbed Dashboard").should("be.visible");

        // Click back — should restore the manually-selected Tab 3, and the
        // manually-changed ID filter value (999, not the click-behavior 1)
        // should still be set. Regression: navigating to a tabbed Dashboard B
        // overwrites the global initialDashboardTabId with B's tab id, so the
        // source dashboard re-mounts on its first tab instead of Tab 3.
        cy.findByText("Back to Tabbed Dashboard").click();
        cy.findByRole("tab", { name: "Tab 3" }).should(
          "have.attr",
          "aria-selected",
          "true",
        );
        H.filterWidget({ name: "ID Filter" }).should("contain.text", "999");
      });
    });

    it("should apply mapped parameters when click behavior points to the same tab-less dashboard", () => {
      const ID_FILTER: Parameter = createMockActionParameter({
        id: "self-link-id-filter",
        name: "ID Filter",
        slug: "id-filter",
        type: "number/=",
        sectionId: "number",
      });

      const QUANTITY_FILTER: Parameter = createMockActionParameter({
        id: "self-link-quantity-filter",
        name: "Quantity Filter",
        slug: "quantity-filter",
        type: "number/=",
        sectionId: "number",
      });

      H.createQuestion({
        name: "Self-linking card",
        query: { "source-table": ORDERS_ID, limit: 5 },
      }).then(({ body: card }) => {
        H.createDashboard({
          name: "Self-linking Dashboard",
          parameters: [ID_FILTER, QUANTITY_FILTER],
        }).then(({ body: dashboard }) => {
          H.addOrUpdateDashboardCard({
            card_id: card.id,
            dashboard_id: dashboard.id,
            card: createMockDashboardCard({
              card_id: card.id,
              size_x: 24,
              size_y: 8,
              parameter_mappings: [
                {
                  parameter_id: ID_FILTER.id,
                  card_id: card.id,
                  target: ["dimension", ["field", ORDERS.ID, null]],
                },
                {
                  parameter_id: QUANTITY_FILTER.id,
                  card_id: card.id,
                  target: ["dimension", ["field", ORDERS.QUANTITY, null]],
                },
              ],
              visualization_settings: {
                column_settings: {
                  [`["ref",["field",${ORDERS.ID},null]]`]: {
                    click_behavior: {
                      type: "link",
                      linkType: "dashboard",
                      linkTextTemplate: "Self link",
                      targetId: dashboard.id,
                      parameterMapping: {
                        [ID_FILTER.id]: {
                          source: { type: "column", id: "ID", name: "ID" },
                          target: {
                            type: "parameter",
                            id: ID_FILTER.id,
                          },
                          id: ID_FILTER.id,
                        },
                      },
                    },
                  },
                },
              },
            }),
          });
          cy.wrap(dashboard.entity_id).as("selfDashboardEntityId");
        });
      });

      cy.signOut();
      mockAuthProviderAndJwtSignIn();

      cy.get<string>("@selfDashboardEntityId").then((dashboardId) => {
        mountSdkContent(
          <InteractiveDashboard
            dashboardId={dashboardId}
            enableEntityNavigation
            initialParameters={{ [QUANTITY_FILTER.slug]: "7" }}
          />,
        );
      });

      cy.wait("@getDashboard");
      cy.wait("@dashcardQuery");

      getSdkRoot().within(() => {
        cy.findByText("Self-linking Dashboard").should("be.visible");
        cy.findByText("Self-linking card").should("be.visible");

        // Pre-condition: Quantity filter is pre-set to 7 via initialParameters
        // and should be preserved across the same-dashboard click behavior.
        H.filterWidget({ name: "Quantity Filter" }).should("contain.text", "7");

        // Click the self-linking link — same dashboard, same (no) tab, with
        // a parameter mapping that should set the dashboard's ID filter.
        H.getDashboardCard().findAllByText("Self link").first().click();

        // Expected: ID filter reflects the mapped cell value AND the
        // unrelated Quantity filter is retained (matches core app's
        // per-parameter merge behavior, not a full-replace).
        //
        // The table is filtered to Quantity=7, so the first row's ID is 8
        // (not 1). The click behavior passes that cell's ID to the ID filter.
        H.filterWidget({ name: "ID Filter" }).should("contain.text", "8");
        H.filterWidget({ name: "Quantity Filter" }).should("contain.text", "7");
        cy.findByText(/Back to/).should("not.exist");
        cy.findByText("Self-linking Dashboard").should("be.visible");
        cy.findByText("Self-linking card").should("be.visible");
      });
    });
  });

  describe("cross-dashboard navigation with tabId", () => {
    beforeEach(() => {
      signInAsAdminAndEnableEmbeddingSdk();

      cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
      cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
        "dashcardQuery",
      );
    });

    it("should open the target dashboard on the requested tab", () => {
      const TARGET_TAB_1 = { id: 1, name: "Target Tab 1" };
      const TARGET_TAB_2 = { id: 2, name: "Target Tab 2" };

      const TARGET_ID_FILTER: Parameter = createMockActionParameter({
        id: "target-id-filter",
        name: "ID Filter",
        slug: "id-filter",
        type: "number/=",
        sectionId: "number",
      });

      H.createQuestion({
        name: "Card on Target Tab 1",
        query: { "source-table": ORDERS_ID, limit: 5 },
      }).then(({ body: targetTab1Card }) => {
        H.createQuestion({
          name: "Card on Target Tab 2",
          query: { "source-table": ORDERS_ID, limit: 5 },
        }).then(({ body: targetTab2Card }) => {
          H.createDashboardWithTabs({
            name: "Target Dashboard",
            parameters: [TARGET_ID_FILTER],
            tabs: [TARGET_TAB_1, TARGET_TAB_2],
            dashcards: [
              createMockDashboardCard({
                id: -1,
                card_id: targetTab1Card.id,
                dashboard_tab_id: TARGET_TAB_1.id,
                size_x: 12,
                size_y: 6,
              }),
              createMockDashboardCard({
                id: -2,
                card_id: targetTab2Card.id,
                dashboard_tab_id: TARGET_TAB_2.id,
                size_x: 12,
                size_y: 6,
                parameter_mappings: [
                  {
                    parameter_id: TARGET_ID_FILTER.id,
                    card_id: targetTab2Card.id,
                    target: ["dimension", ["field", ORDERS.ID, null]],
                  },
                ],
              }),
            ],
          }).then((targetDashboard) => {
            const resolvedTargetTab2 = (targetDashboard.tabs ?? [])[1];

            H.createQuestion({
              name: "Source Card",
              query: { "source-table": ORDERS_ID, limit: 5 },
            }).then(({ body: sourceCard }) => {
              H.createDashboard({ name: "Source Dashboard" }).then(
                ({ body: sourceDashboard }) => {
                  H.addOrUpdateDashboardCard({
                    card_id: sourceCard.id,
                    dashboard_id: sourceDashboard.id,
                    card: createMockDashboardCard({
                      card_id: sourceCard.id,
                      size_x: 24,
                      size_y: 8,
                      visualization_settings: {
                        column_settings: {
                          [`["ref",["field",${ORDERS.ID},null]]`]: {
                            click_behavior: {
                              type: "link",
                              linkType: "dashboard",
                              linkTextTemplate: "Go to Target Tab 2",
                              targetId: targetDashboard.id,
                              tabId: resolvedTargetTab2.id,
                              parameterMapping: {
                                [TARGET_ID_FILTER.id]: {
                                  source: {
                                    type: "column",
                                    id: "ID",
                                    name: "ID",
                                  },
                                  target: {
                                    type: "parameter",
                                    id: TARGET_ID_FILTER.id,
                                  },
                                  id: TARGET_ID_FILTER.id,
                                },
                              },
                            },
                          },
                        },
                      },
                    }),
                  });
                  cy.wrap(sourceDashboard.entity_id).as(
                    "sourceDashboardEntityId",
                  );
                },
              );
            });
          });
        });
      });

      cy.signOut();
      mockAuthProviderAndJwtSignIn();

      cy.get<string>("@sourceDashboardEntityId").then((dashboardId) => {
        mountSdkContent(
          <InteractiveDashboard
            dashboardId={dashboardId}
            enableEntityNavigation
          />,
        );
      });

      cy.wait("@getDashboard");
      cy.wait("@dashcardQuery");

      getSdkRoot().within(() => {
        cy.findByText("Source Dashboard").should("be.visible");

        H.getDashboardCard()
          .findAllByText("Go to Target Tab 2")
          .first()
          .click();

        cy.wait("@getDashboard");

        cy.findByText("Target Dashboard").should("be.visible");
        cy.findByRole("tab", { name: "Target Tab 2" }).should(
          "have.attr",
          "aria-selected",
          "true",
        );
        cy.findByText("Card on Target Tab 2").should("be.visible");

        // Target dashboard's ID filter should reflect the value passed by
        // the click behavior's parameterMapping.
        H.filterWidget({ name: "ID Filter" }).should("contain.text", "1");

        cy.findByText("Back to Source Dashboard").should("be.visible");
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

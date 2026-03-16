import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { getSignedJwtForResource, updateSetting } from "e2e/support/helpers";
import { JWT_SHARED_SECRET } from "e2e/support/helpers/embedding-sdk-helpers/constants";
import type { Parameter } from "metabase-types/api";
import { createMockActionParameter } from "metabase-types/api/mocks";

const { H } = cy;
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const TARGET_DASHBOARD_FILTER: Parameter = createMockActionParameter({
  id: "target-dashboard-filter",
  name: "ID Filter",
  slug: "id-filter",
  type: "number/=",
  sectionId: "number",
});

describe("scenarios > embedding > sdk iframe embedding > internal-navigation", () => {
  describe("click behavior navigation", () => {
    beforeEach(() => {
      H.prepareSdkIframeEmbedTest({ withToken: "bleeding-edge" });

      // Setup:
      // "Starting Dashboard" with links to:
      // - "Target Dashboard" with a filter parameter
      // - "Native Question" with a parameter

      // 1. Create a native question with a parameter (for question link target)
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

      // 2. Create target dashboard with a filter parameter
      H.createDashboard({
        name: "Target Dashboard",
        parameters: [TARGET_DASHBOARD_FILTER],
      }).then(({ body: targetDashboard }) => {
        cy.wrap(targetDashboard.id).as("targetDashboardId");

        H.createQuestion({
          name: "Orders for Target Dashboard",
          query: { "source-table": ORDERS_ID, limit: 5 },
        }).then(({ body: targetQuestion }) => {
          H.addOrUpdateDashboardCard({
            card_id: targetQuestion.id,
            dashboard_id: targetDashboard.id,
            card: {
              row: 0,
              col: 0,
              size_x: 24,
              size_y: 8,
              parameter_mappings: [
                {
                  parameter_id: TARGET_DASHBOARD_FILTER.id,
                  card_id: targetQuestion.id,
                  target: ["dimension", ["field", ORDERS.ID, null]],
                },
              ],
            },
          });
        });
      });

      // 3. Create starting dashboard with click behaviors linking to target dashboard and native question
      cy.then(function () {
        H.createDashboard({
          name: "Starting Dashboard",
          enable_embedding: true,
          embedding_type: "guest-embed",
        }).then(({ body: startingDashboard }) => {
          cy.wrap(startingDashboard.id).as("startingDashboardId");

          H.createQuestion({
            name: "Orders for Starting Dashboard",
            query: { "source-table": ORDERS_ID, limit: 5 },
          }).then(({ body: startingQuestion }) => {
            H.addOrUpdateDashboardCard({
              card_id: startingQuestion.id,
              dashboard_id: startingDashboard.id,
              card: {
                row: 0,
                col: 0,
                size_x: 24,
                size_y: 8,
                visualization_settings: {
                  column_settings: {
                    // ID column links to target dashboard with parameter
                    [`["ref",["field",${ORDERS.ID},null]]`]: {
                      click_behavior: {
                        type: "link",
                        linkType: "dashboard",
                        linkTextTemplate: "Go to Target Dashboard",
                        targetId: this.targetDashboardId,
                        parameterMapping: {
                          [TARGET_DASHBOARD_FILTER.id]: {
                            source: {
                              type: "column",
                              id: "ID",
                              name: "ID",
                            },
                            target: {
                              type: "parameter",
                              id: TARGET_DASHBOARD_FILTER.id,
                            },
                            id: TARGET_DASHBOARD_FILTER.id,
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
                        targetId: this.nativeQuestionId,
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

    it("should navigate to a linked dashboard with filters when clicking a dashboard link", () => {
      cy.get<number>("@startingDashboardId").then((startingDashboardId) => {
        H.visitCustomHtmlPage(`
          ${H.getNewEmbedScriptTag()}
          ${H.getNewEmbedConfigurationScript({})}
          <metabase-dashboard dashboard-id="${startingDashboardId}" drills enable-entity-navigation />
        `);
      });

      cy.wait("@getDashCardQuery");

      cy.log("click on the dashboard link");
      H.getSimpleEmbedIframeContent()
        .findAllByText("Go to Target Dashboard")
        .first()
        .click();

      cy.wait("@getDashboard");

      cy.log("verify we navigated to Target Dashboard");
      H.getSimpleEmbedIframeContent()
        .findByText("Target Dashboard")
        .should("be.visible");

      cy.log("verify the filter was passed");
      H.getSimpleEmbedIframeContent()
        .findByTestId("dashboard-parameters-widget-container")
        .findByLabelText("ID Filter")
        .should("contain", "1");

      cy.log("verify back button and navigate back");
      H.getSimpleEmbedIframeContent()
        .findByText("Back to Starting Dashboard")
        .should("be.visible")
        .click();

      cy.log("verify we returned to Starting Dashboard");
      H.getSimpleEmbedIframeContent()
        .findByText("Starting Dashboard")
        .should("be.visible");
      H.getSimpleEmbedIframeContent()
        .findByText(/Back to/)
        .should("not.exist");
    });

    it("should navigate to a linked question with parameters when clicking a question link", () => {
      cy.get<number>("@startingDashboardId").then((startingDashboardId) => {
        H.visitCustomHtmlPage(`
          ${H.getNewEmbedScriptTag()}
          ${H.getNewEmbedConfigurationScript({})}
          <metabase-dashboard dashboard-id="${startingDashboardId}" drills enable-entity-navigation />
        `);
      });

      cy.wait("@getDashCardQuery");

      cy.log("click on the question link");
      H.getSimpleEmbedIframeContent()
        .findAllByText("Go to Native Question")
        .first()
        .click();

      cy.log("verify the question loaded");
      H.getSimpleEmbedIframeContent()
        .findByTestId("query-visualization-root")
        .should("be.visible");

      cy.log("verify back button is visible");
      H.getSimpleEmbedIframeContent()
        .findByText("Back to Starting Dashboard")
        .should("be.visible");
    });

    it("should not navigate when drills are disabled", () => {
      cy.get<number>("@startingDashboardId").then((startingDashboardId) => {
        H.visitCustomHtmlPage(`
          ${H.getNewEmbedScriptTag()}
          ${H.getNewEmbedConfigurationScript({})}
          <metabase-dashboard dashboard-id="${startingDashboardId}" drills="false" enable-entity-navigation />
        `);
      });

      cy.wait("@getDashCardQuery");

      cy.log("click on a cell that has click behavior configured");
      H.getSimpleEmbedIframeContent().findAllByText("37.65").first().click();

      cy.log("no drill popover should appear");
      H.getSimpleEmbedIframeContent()
        .findByText(/Filter by this value/)
        .should("not.exist");

      cy.log("no navigation should happen");
      H.getSimpleEmbedIframeContent()
        .findByText("Target Dashboard")
        .should("not.exist");
      H.getSimpleEmbedIframeContent()
        .findByText(/Back to/)
        .should("not.exist");
    });

    it("should not support internal navigation on guest embeds", () => {
      // Enable guest embedding settings
      cy.request("PUT", "/api/setting/enable-embedding-simple", {
        value: true,
      });
      cy.request("PUT", "/api/setting/enable-embedding-static", {
        value: true,
      });
      updateSetting("embedding-secret-key", JWT_SHARED_SECRET);

      cy.get("@startingDashboardId").then(async (dashboardId) => {
        const token = await getSignedJwtForResource({
          resourceId: dashboardId as unknown as number,
          resourceType: "dashboard",
        });

        const frame = H.loadSdkIframeEmbedTestPage({
          metabaseConfig: { isGuest: true },
          elements: [
            {
              component: "metabase-dashboard",
              attributes: {
                token,
                drills: true,
              },
            },
          ],
        });

        frame.within(() => {
          cy.log("dashboard should render");
          cy.findByText("Orders for Starting Dashboard", {
            timeout: 10000,
          }).should("be.visible");

          cy.log(
            "click behavior link text should not be shown, actual data values should be visible instead",
          );
          cy.findByText("Go to Target Dashboard").should("not.exist");
        });
      });
    });
  });

  describe("<metabase-browser> breadcrumbs", () => {
    beforeEach(() => {
      H.prepareSdkIframeEmbedTest({ withToken: "bleeding-edge" });

      H.createDashboard({ name: "Target Dashboard" }).then(
        ({ body: targetDashboard }) => {
          cy.wrap(targetDashboard.id).as("targetDashboardId");

          H.createQuestion({
            name: "Orders in Target Dashboard",
            query: { "source-table": ORDERS_ID, limit: 5 },
          }).then(({ body: targetQuestion }) => {
            H.addOrUpdateDashboardCard({
              card_id: targetQuestion.id,
              dashboard_id: targetDashboard.id,
              card: {
                row: 0,
                col: 0,
                size_x: 24,
                size_y: 8,
              },
            });
          });
        },
      );

      cy.then(function () {
        H.createDashboard({ name: "First Dashboard" }).then(
          ({ body: dashboard }) => {
            H.createQuestion({
              name: "Orders in First Dashboard",
              query: { "source-table": ORDERS_ID, limit: 5 },
            }).then(({ body: dashQuestion }) => {
              H.addOrUpdateDashboardCard({
                card_id: dashQuestion.id,
                dashboard_id: dashboard.id,
                card: {
                  row: 0,
                  col: 0,
                  size_x: 24,
                  size_y: 8,
                  visualization_settings: {
                    column_settings: {
                      [`["ref",["field",${ORDERS.ID},null]]`]: {
                        click_behavior: {
                          type: "link",
                          linkType: "dashboard",
                          linkTextTemplate: "Go to Target Dashboard",
                          targetId: this.targetDashboardId,
                          parameterMapping: {},
                        },
                      },
                    },
                  },
                },
              });
            });
          },
        );
      });
    });

    it("should hide breadcrumbs during internal navigation and show them again after going back", () => {
      H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript({})}
        <metabase-browser initial-collection="root" enable-entity-navigation />
      `);

      cy.log("click on the dashboard to open it");
      H.getSimpleEmbedIframeContent()
        .findByText("First Dashboard")
        .should("be.visible")
        .click();

      cy.wait("@getDashCardQuery");

      cy.log("breadcrumbs should be visible");
      H.getSimpleEmbedIframeContent()
        .findByTestId("sdk-breadcrumbs")
        .should("be.visible");

      cy.log("no back button should exist");
      H.getSimpleEmbedIframeContent()
        .findByText(/Back to/)
        .should("not.exist");

      cy.log("click on click behavior link to trigger internal navigation");
      H.getSimpleEmbedIframeContent()
        .findAllByText("Go to Target Dashboard")
        .first()
        .click();

      cy.log("breadcrumbs should be hidden after navigating");
      H.getSimpleEmbedIframeContent()
        .findByTestId("sdk-breadcrumbs")
        .should("not.exist");

      cy.log("back button should be visible");
      H.getSimpleEmbedIframeContent()
        .findByText("Back to First Dashboard")
        .should("be.visible")
        .click();

      cy.log("verify we returned to First Dashboard");
      H.getSimpleEmbedIframeContent()
        .findAllByText("First Dashboard")
        .should("have.length", 2); // breadcrumbs and the dashboard heading

      cy.log("breadcrumbs should be visible again");
      H.getSimpleEmbedIframeContent()
        .findByTestId("sdk-breadcrumbs")
        .should("be.visible");

      cy.log("back button should be gone");
      H.getSimpleEmbedIframeContent()
        .findByText(/Back to/)
        .should("not.exist");
    });

    it("should clean up navigation stack when clicking a collection breadcrumb after navigating back", () => {
      H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript({})}
        <metabase-browser initial-collection="root" enable-entity-navigation />
      `);

      cy.log("open First Dashboard from the browser");
      H.getSimpleEmbedIframeContent()
        .findByText("First Dashboard")
        .should("be.visible")
        .click();

      cy.wait("@getDashCardQuery");

      cy.log("navigate to Target Dashboard via click behavior link");
      H.getSimpleEmbedIframeContent()
        .findAllByText("Go to Target Dashboard")
        .first()
        .click();

      cy.wait("@getDashboard");

      cy.log("click back to return to First Dashboard");
      H.getSimpleEmbedIframeContent()
        .findByText("Back to First Dashboard")
        .should("be.visible")
        .click();

      cy.log(
        "click 'Our analytics' breadcrumb to go back to the collection browser",
      );
      H.getSimpleEmbedIframeContent()
        .findByTestId("sdk-breadcrumbs")
        .findByText("Our analytics")
        .click();

      cy.log("verify the collection browser is showing items again");
      H.getSimpleEmbedIframeContent()
        .findByText("First Dashboard")
        .should("be.visible");

      cy.log(
        "verify no back button is present (navigation stack should be clean)",
      );
      H.getSimpleEmbedIframeContent()
        .findByText(/Back to/)
        .should("not.exist");

      cy.log(
        "verify we can navigate to a dashboard again (no stale virtual entries)",
      );
      H.getSimpleEmbedIframeContent().findByText("First Dashboard").click();

      cy.wait("@getDashCardQuery");

      H.getSimpleEmbedIframeContent()
        .findByTestId("sdk-breadcrumbs")
        .findByText("First Dashboard")
        .should("be.visible");
    });
  });
});

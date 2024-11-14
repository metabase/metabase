import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestionAndDashboard,
  restore,
  updateDashboardCards,
  visitDashboard,
} from "e2e/support/helpers";
import {
  describeSDK,
  getSdkRoot,
  signInAsAdminAndEnableEmbeddingSdk,
  visitSdkStory,
} from "e2e/support/helpers/e2e-embedding-sdk-helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describeSDK("scenarios > embedding-sdk > interactive-dashboard", () => {
  beforeEach(() => {
    restore();
    signInAsAdminAndEnableEmbeddingSdk();

    createQuestionAndDashboard({
      questionDetails: {
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            ["Quantity_2"]: ["field", ORDERS.QUANTITY, null],
          },
        },
      },
      dashboardDetails: { name: "Interactive Dashboard SDK Test" },
    }).then(({ body: { dashboard_id, question_id, id: dashcard_id } }) => {
      const questionCard = {
        row: 2,
        size_x: 16,
        size_y: 6,
        id: dashcard_id,
        card_id: question_id,
      };

      cy.wrap(dashboard_id).as("dashboardId");
      cy.log(`dashboard id = ${dashboard_id}`);

      updateDashboardCards({ dashboard_id, cards: [questionCard] });
      visitDashboard(dashboard_id);
    });

    cy.signOut();

    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept("GET", "/api/user/current").as("getUser");
  });

  it("should not open sidesheet when clicking last edit info (metabase#48354)", () => {
    cy.get("@dashboardId").then(dashboardId => {
      visitSdkStory({
        storyId: "embeddingsdk-editabledashboard--default",
        windowEnvs: { DASHBOARD_ID: dashboardId },
      });
    });

    getSdkRoot()
      .findByText("Edited a few seconds ago by Bobby Tables")
      .click()
      .should("be.visible");

    cy.findByRole("heading", { name: "Info" }).should("not.exist");
    cy.findByRole("tab", { name: "Overview" }).should("not.exist");
    cy.findByRole("tab", { name: "History" }).should("not.exist");
  });

  it("should be able to display custom question layout when clicking on dashboard cards", () => {
    cy.get("@dashboardId").then(dashboardId => {
      visitSdkStory({
        storyId:
          "embeddingsdk-interactivedashboard--with-custom-question-layout",
        windowEnvs: { DASHBOARD_ID: dashboardId },
      });
    });

    getSdkRoot().within(() => {
      cy.findByText("Revenue per quarter").click();
      cy.contains("Revenue per quarter").should("be.visible");
      cy.contains("This is a custom question layout.");
    });
  });
});

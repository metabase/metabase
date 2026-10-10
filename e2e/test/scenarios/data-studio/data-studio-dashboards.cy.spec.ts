const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { DashboardId } from "metabase-types/api";

const { ORDERS_ID } = SAMPLE_DATABASE;

const DASHBOARD_NAME = "Sales overview";
const QUESTION_NAME = "Orders count";

const dashboardsPage = () => cy.findByTestId("library-page");
const dashboardHeader = () => cy.findByTestId("dashboard-pane-header");

function createLibraryDashboard() {
  H.createLibrary().then(({ body: library }) => {
    const dashboardsCollection = library.effective_children?.find(
      ({ type }) => type === "library-dashboards",
    );
    if (dashboardsCollection == null) {
      throw new Error("The Library has no Dashboards collection");
    }

    H.createQuestionAndDashboard({
      questionDetails: {
        name: QUESTION_NAME,
        query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
      },
      dashboardDetails: {
        name: DASHBOARD_NAME,
        collection_id: dashboardsCollection.id,
      },
    }).then(({ body: dashcard }) => {
      cy.wrap(dashcard.dashboard_id).as("dashboardId");
    });
  });
}

describe("scenarios > data studio > dashboards", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    createLibraryDashboard();
  });

  it("opens a Library dashboard, shows its contents, and returns from the editor", () => {
    cy.get<DashboardId>("@dashboardId").then((dashboardId) => {
      const overviewPath = `/data-studio/dashboards/${dashboardId}`;

      cy.visit("/data-studio/dashboards");
      dashboardsPage()
        .findByRole("link", { name: new RegExp(DASHBOARD_NAME) })
        .click();

      cy.location("pathname").should("eq", overviewPath);
      dashboardHeader().should("contain", DASHBOARD_NAME);
      cy.findByTestId("dashboard-preview")
        .findByText(QUESTION_NAME)
        .should("be.visible");

      cy.log("Contents lists the question on the dashboard");
      dashboardHeader().findByRole("link", { name: "Contents" }).click();
      cy.location("pathname").should("eq", `${overviewPath}/contents`);
      cy.findByTestId("dashboard-contents-page")
        .findByRole("row", { name: new RegExp(QUESTION_NAME) })
        .should("be.visible")
        .and("contain", "Question");

      cy.log("Edit opens the main-app editor and Cancel comes back here");
      dashboardHeader().findByRole("button", { name: /Edit/ }).click();
      cy.location("pathname").should(
        "match",
        new RegExp(`^/dashboard/${dashboardId}-`),
      );
      cy.findByTestId("edit-bar").should("be.visible");
      H.dashboardCancelButton().click();

      cy.location("pathname").should("eq", overviewPath);
      cy.findByTestId("dashboard-overview-page").should("be.visible");
    });
  });
});

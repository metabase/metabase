const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { DashboardId } from "metabase-types/api";

const { ORDERS_ID } = SAMPLE_DATABASE;

const DASHBOARD_NAME = "Sales overview";
const QUESTION_NAME = "Orders count";
const METRIC_NAME = "Library revenue";
const REGULAR_QUESTION_NAME = "Regular orders count";

const dashboardsPage = () => cy.findByTestId("library-page");
const dashboardHeader = () => cy.findByTestId("dashboard-pane-header");
const addCardSidebar = () => cy.findByTestId("add-card-sidebar");

function createLibraryDashboard() {
  H.createLibrary().then(({ dashboardsCollectionId, metricsCollectionId }) => {
    H.createQuestion({
      name: REGULAR_QUESTION_NAME,
      collection_id: null,
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
    });

    // the Metrics collection only accepts metrics, and the helper creates a
    // plain question before it changes the type, so the metric is moved in after
    H.createQuestion({
      name: METRIC_NAME,
      type: "metric",
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
    }).then(({ body: metric }) => {
      cy.request("PUT", `/api/card/${metric.id}`, {
        collection_id: metricsCollectionId,
      });
    });

    H.createDashboard({
      name: DASHBOARD_NAME,
      collection_id: dashboardsCollectionId,
    }).then(({ body: dashboard }) => {
      cy.wrap(dashboard.id).as("dashboardId");
      // only library cards may sit on a library dashboard, and a dashboard
      // question lives in the dashboard's own (library) collection
      H.createQuestion({
        name: QUESTION_NAME,
        dashboard_id: dashboard.id,
        query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
      });
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

      cy.log(
        "Edit opens the main-app editor and Cancel comes back to Contents",
      );
      dashboardHeader().findByRole("button", { name: /Edit/ }).click();
      cy.location("pathname").should(
        "match",
        new RegExp(`^/dashboard/${dashboardId}-`),
      );
      cy.findByTestId("edit-bar").should("be.visible");
      H.dashboardCancelButton().click();

      cy.location("pathname").should("eq", `${overviewPath}/contents`);
      cy.findByTestId("dashboard-contents-page").should("be.visible");
    });
  });

  describe("only library questions can be added (GHY-4988)", () => {
    it("offers only library metrics when adding a chart to a Library dashboard", () => {
      cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");

      H.visitDashboard("@dashboardId");
      H.editDashboard();
      H.openQuestionsSidebar();

      cy.log("The sidebar browses the Library's Metrics collection");
      addCardSidebar()
        .findByRole("menuitem", { name: new RegExp(METRIC_NAME) })
        .should("be.visible");
      addCardSidebar().should("not.contain", REGULAR_QUESTION_NAME);

      cy.log("A library metric can be added and saved");
      addCardSidebar()
        .findByRole("menuitem", { name: new RegExp(METRIC_NAME) })
        .click();
      H.getDashboardCards().should("have.length", 2);
      H.saveDashboard();
      cy.wait("@updateDashboard").its("response.statusCode").should("eq", 200);
      H.dashboardGrid()
        .should("contain", QUESTION_NAME)
        .and("contain", METRIC_NAME);
    });

    it("confines the Replace picker of a Library dashboard to the Library", () => {
      cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");

      H.visitDashboard("@dashboardId");
      H.editDashboard();
      H.getDashboardCard(0).realHover().findByLabelText("Replace").click();

      cy.log("Only the Library is offered");
      H.entityPickerModalLevel(0)
        .should("contain", "Library")
        .and("not.contain", "Our analytics")
        .and("not.contain", "Recent items");

      cy.log("It opens at the Library's metrics, even for its own question");
      H.entityPickerModalLevel(2)
        .should("contain", METRIC_NAME)
        .and("not.contain", REGULAR_QUESTION_NAME);
      H.entityPickerModalLevel(3).should("not.exist");

      cy.log("A library metric can replace the question");
      H.entityPickerModalItem(2, METRIC_NAME).click();
      H.entityPickerModal().should("not.exist");
      H.getDashboardCard(0).should("contain", METRIC_NAME);
      H.saveDashboard();
      cy.wait("@updateDashboard").its("response.statusCode").should("eq", 200);
      H.dashboardGrid()
        .should("contain", METRIC_NAME)
        .and("not.contain", QUESTION_NAME);
    });
  });
});

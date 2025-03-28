const { H } = cy;
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

const cards = [
  {
    card_id: ORDERS_COUNT_QUESTION_ID,
    row: 0,
    col: 0,
    size_x: 5,
    size_y: 4,
  },
  {
    card_id: ORDERS_BY_YEAR_QUESTION_ID,
    row: 0,
    col: 5,
    size_x: 5,
    size_y: 5,
  },
];

describe("dashboard card fetching", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should pass same dashboard_load_id to every query to enable metadata cache sharing", () => {
    createDashboardWithCards({ cards }).then(H.visitDashboard);

    cy.wait(["@dashcardQuery", "@dashcardQuery"]).then((interceptions) => {
      const query1 = interceptions[0].request.body;
      const query2 = interceptions[1].request.body;

      expect(query1.dashboard_load_id).to.have.length(36);
      expect(query2.dashboard_load_id).to.have.length(36);
      expect(query1.dashboard_load_id).to.equal(query2.dashboard_load_id);
    });
  });

  it("should pass dashboard_id for ad-hoc queries within a dashboard", () => {
    cy.log("regular ad-hoc query - no dashboard_id");
    H.openProductsTable();
    cy.wait("@dataset").then(({ request }) => {
      expect(request.body.dashboard_id).to.be.null;
    });

    cy.log("drill - with dashboard_id");
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.getDashboardCard().findByText("2.9").click();
    H.popover().findByText("=").click();
    cy.wait("@dataset").then(({ request }) => {
      expect(request.body.dashboard_id).to.eq(ORDERS_DASHBOARD_ID);
    });

    cy.log("subsequent query change - with dashboard_id");
    H.filter();
    H.popover().within(() => {
      cy.findByText("Product").click();
      cy.findByText("Category").click();
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    H.runButtonOverlay().click();
    cy.wait("@dataset").then(({ request }) => {
      expect(request.body.dashboard_id).to.eq(ORDERS_DASHBOARD_ID);
    });
  });
});

function createDashboardWithCards({
  dashboardName = "test dashboard",
  cards = [],
} = {}) {
  return H.createDashboard({ name: dashboardName }).then(({ body: { id } }) => {
    H.updateDashboardCards({
      dashboard_id: id,
      cards,
    });

    cy.wrap(id).as("dashboardId");
  });
}

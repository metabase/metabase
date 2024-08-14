import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_BY_YEAR_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { visitDashboard, updateDashboardCards } from "e2e/support/helpers";

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
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should pass same dashboard_load_id to every query to enable metadata cache sharing", () => {
    createDashboardWithCards({ cards }).then(visitDashboard);

    cy.wait(["@dashcardQuery", "@dashcardQuery"]).then(interceptions => {
      const query1 = interceptions[0].request.body;
      const query2 = interceptions[1].request.body;

      expect(query1.dashboard_load_id).to.have.length(36);
      expect(query2.dashboard_load_id).to.have.length(36);
      expect(query1.dashboard_load_id).to.equal(query2.dashboard_load_id);
    });
  });
});

function createDashboardWithCards({
  dashboardName = "test dashboard",
  cards = [],
} = {}) {
  return cy
    .createDashboard({ name: dashboardName })
    .then(({ body: { id } }) => {
      updateDashboardCards({
        dashboard_id: id,
        cards,
      });

      cy.wrap(id).as("dashboardId");
    });
}

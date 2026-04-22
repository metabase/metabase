const { H } = cy;
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
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
    H.interceptDashboardCardRequests({ alias: "dashcardQuery" });
  });

  it("should include a dashboard_load_id with the batch card query", () => {
    createDashboardWithCards({ cards }).then(H.visitDashboard);

    cy.wait("@dashcardQuery").then((interception) => {
      expect(interception.request.body.dashboard_load_id).to.have.length(36);
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

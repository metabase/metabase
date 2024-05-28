const { SAMPLE_DATABASE } = require("e2e/support/cypress_sample_database");
const { restore, visitDashboard, popover } = require("e2e/support/helpers");

const { ORDERS_ID } = SAMPLE_DATABASE;

const ORDERS_QUESTION = {
  name: "Orders question",
  query: {
    "source-table": ORDERS_ID,
  },
};

describe("issue 12578", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not fetch cards that are still loading when refreshing", () => {
    cy.clock(Date.now());
    cy.createQuestionAndDashboard({ questionDetails: ORDERS_QUESTION }).then(
      ({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      },
    );

    // Without tick the dashboard header will not load
    cy.tick();
    cy.findByLabelText("Auto Refresh").click();
    popover().findByText("1 minute").click();

    // Mock slow card request
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query", req => {
      req.on("response", res => {
        res.setDelay(99999);
      });
    }).as("dashcardQuery");
    cy.tick(61 * 1000);
    cy.tick(61 * 1000);

    cy.get("@dashcardQuery.all").should("have.length", 1);
  });
});

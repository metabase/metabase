import {
  restore,
  popover,
  visitDashboard,
  editDashboard,
  setFilter,
  openNewPublicLinkDropdown,
} from "e2e/support/helpers";

describe("issue 20393", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dashboard/*/public_link").as("publicLink");

    restore();
    cy.signInAsAdmin();
  });

  it("should show public dashboards with nested cards mapped to parameters (metabase#20393)", () => {
    createDashboardWithNestedCard();

    editDashboard();

    setFilter("Time", "All Options");

    // map the date parameter to the card
    cy.findByTestId("dashcard-container").contains("Select").click();
    popover().contains("CREATED_AT").click();

    // save the dashboard
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    // open the sharing modal and enable sharing
    openNewPublicLinkDropdown("dashboard");

    // navigate to the public dashboard link
    cy.wait("@publicLink").then(({ response: { body } }) => {
      const { uuid } = body;

      cy.signOut();
      cy.visit(`/public/dashboard/${uuid}`);
    });

    // verify that the card is visible on the page
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Q2");
  });
});

function createDashboardWithNestedCard() {
  cy.createNativeQuestion({
    name: "Q1",
    native: { query: 'SELECT * FROM "ORDERS"', "template-tags": {} },
  }).then(({ body }) =>
    cy
      .createQuestionAndDashboard({
        questionDetails: {
          name: "Q2",
          query: { "source-table": `card__${body.id}` },
        },
        dashboardDetails: {
          name: "Q2 in a dashboard",
        },
      })
      .then(({ body: { dashboard_id } }) => visitDashboard(dashboard_id)),
  );
}

import {
  restore,
  popover,
  visitDashboard,
  saveDashboard,
  editDashboard,
  setFilter,
} from "e2e/support/helpers";

const questionDetails = {
  name: "22524 question",
  native: {
    query: "select * from people where city = {{city}}",
    "template-tags": {
      city: {
        id: "6d077d39-a420-fd14-0b0b-a5eb611ce1e0",
        name: "city",
        "display-name": "City",
        type: "text",
      },
    },
  },
};

describe("issue 22524", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("update dashboard cards when changing parameters on publicly shared dashboards (metabase#22524)", () => {
    cy.createNativeQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      },
    );

    editDashboard();
    setFilter("Text or Category", "Is");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    popover().contains("City").click();

    saveDashboard();

    // Share dashboard
    cy.icon("share").click();
    cy.findByRole("switch").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Public link")
      .parent()
      .within(() => {
        cy.get("input").then(input => {
          cy.visit(input.val());
        });
      });

    // Set parameter value
    cy.findByPlaceholderText("Text").clear().type("Rye{enter}");

    // Check results
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("2-7900 Cuerno Verde Road");
  });
});

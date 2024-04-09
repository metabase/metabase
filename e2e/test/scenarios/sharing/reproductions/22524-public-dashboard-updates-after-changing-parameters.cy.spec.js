import {
  restore,
  popover,
  visitDashboard,
  saveDashboard,
  editDashboard,
  setFilter,
  openNewPublicLinkDropdown,
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
        cy.intercept("POST", `/api/dashboard/${dashboard_id}/public_link`).as(
          "publicLink",
        );
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
    openNewPublicLinkDropdown("dashboard");

    cy.wait("@publicLink").then(({ response: { body } }) => {
      const { uuid } = body;

      cy.signOut();
      cy.visit(`/public/dashboard/${uuid}`);
    });

    // Set parameter value
    cy.findByPlaceholderText("Text").clear().type("Rye{enter}");

    // Check results
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("2-7900 Cuerno Verde Road");
  });
});

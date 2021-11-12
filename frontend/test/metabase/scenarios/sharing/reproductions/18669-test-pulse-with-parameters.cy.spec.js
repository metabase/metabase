import { popover, restore, setupSMTP } from "__support__/e2e/cypress";
import { USERS } from "__support__/e2e/cypress_data";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { admin } = USERS;
const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATASET;

describe("issue 18669", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setupSMTP();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: card }) => {
        cy.editDashboardCard(card, getFilterMapping(card));

        cy.intercept("POST", `/api/card/${card.id}/query`).as("cardQuery");
        cy.visit(`/dashboard/${card.dashboard_id}`);
        cy.wait("@cardQuery");
      },
    );
  });

  it("should send a test email with non-default parameters (metabase#18669)", () => {
    cy.icon("share").click();
    cy.findByText("Dashboard subscriptions").click();
    cy.findByText("Email it").click();

    cy.findByPlaceholderText("Enter user names or email addresses")
      .click()
      .type(`${admin.first_name} ${admin.last_name}{enter}`)
      .blur();

    popover().within(() => {
      cy.findByText("Gizmo").click();
      cy.findByText("Update filter").click();
    });

    cy.findByText("Send email now").click();
    cy.findByText("Email sent");
  });
});

const questionDetails = {
  name: "Product count",
  database: 1,
  type: "query",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
};

const filterDetails = {
  name: "Category",
  slug: "category",
  id: "c32a49e1",
  type: "category",
  default: ["Doohickey"],
};

const dashboardDetails = {
  parameters: [filterDetails],
};

const getFilterMapping = card => ({
  parameter_mappings: [
    {
      parameter_id: filterDetails.id,
      card_id: card.card_id,
      target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
    },
  ],
});

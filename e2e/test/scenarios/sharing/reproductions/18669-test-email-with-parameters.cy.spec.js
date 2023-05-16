import {
  describeEE,
  popover,
  restore,
  setupSMTP,
  sidebar,
  visitDashboard,
  clickSend,
} from "e2e/support/helpers";

import { USERS, SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { admin } = USERS;
const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

describeEE("issue 18669", { tags: "@external" }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setupSMTP();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: card }) => {
        cy.editDashboardCard(card, getFilterMapping(card));
        visitDashboard(card.dashboard_id);
      },
    );
  });

  it("should send a test email with non-default parameters (metabase#18669)", () => {
    cy.icon("subscription").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Email it").click();

    cy.findByPlaceholderText("Enter user names or email addresses")
      .click()
      .type(`${admin.first_name} ${admin.last_name}{enter}`)
      .blur();

    sidebar().within(() => {
      cy.findByText("Doohickey").click();
    });

    popover().within(() => {
      cy.findByText("Gizmo").click();
      cy.button("Update filter").click();
    });

    clickSend();
  });
});

const questionDetails = {
  name: "Product count",
  database: SAMPLE_DB_ID,
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

import {
  restore,
  visitDashboard,
  editDashboard,
  saveDashboard,
  setupSMTP,
  sendEmailAndAssert,
} from "__support__/e2e/helpers";

import { USERS } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { admin } = USERS;

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const q1Details = {
  name: "21559-1",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["avg", ["field", ORDERS.TOTAL, null]]],
  },
  display: "scalar",
};

const q2Details = {
  name: "21559-2",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
  },
  display: "scalar",
};

describe("issue 21559", { tags: "@external" }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    setupSMTP();

    cy.createQuestionAndDashboard({
      questionDetails: q1Details,
    }).then(({ body: { dashboard_id } }) => {
      cy.createQuestion(q2Details);

      visitDashboard(dashboard_id);
      editDashboard();
    });
  });

  it("should respect dashboard card visualization (metabase#21559)", () => {
    cy.findByTestId("add-series-button").click({ force: true });

    cy.findByText(q2Details.name).click();
    cy.get(".AddSeriesModal").within(() => {
      cy.findByText("Done").click();
    });

    // Make sure visualization changed to bars
    cy.get(".bar").should("have.length", 2);

    saveDashboard();

    cy.icon("subscription").click();
    cy.findByText("Email it").click();

    cy.findByPlaceholderText("Enter user names or email addresses")
      .click()
      .type(`${admin.first_name} ${admin.last_name}{enter}`)
      .blur(); // blur is needed to close the popover

    sendEmailAndAssert(email => {
      expect(email.html).to.include("img"); // Bar chart is sent as img (inline attachment)
      expect(email.html).not.to.include("80.52"); // Scalar displays its value in HTML
    });
  });
});

import {
  restore,
  editDashboard,
  saveDashboard,
  setupSMTP,
  visitDashboard,
  clickSend,
} from "__support__/e2e/helpers";

import { USERS } from "__support__/e2e/cypress_data";

const {
  admin: { first_name, last_name },
} = USERS;

describe("issue 18344", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    setupSMTP();

    // Rename the question
    visitDashboard(1);

    editDashboard();

    // Open visualization options
    cy.get(".Card").realHover();
    cy.icon("palette").click();

    cy.get(".Modal").within(() => {
      cy.findByDisplayValue("Orders").type("Foo");

      cy.button("Done").click();
    });

    saveDashboard();
    cy.findByText("OrdersFoo");
  });

  it("subscription should not include original question name when it's been renamed in the dashboard (metabase#18344)", () => {
    // Send a test email subscription
    cy.icon("subscription").click();
    cy.findByText("Email it").click();

    cy.findByPlaceholderText("Enter user names or email addresses").click();
    cy.findByText(`${first_name} ${last_name}`).click();
    // Click this just to close the popover that is blocking the "Send email now" button
    cy.findByText(`To:`).click();

    clickSend();

    cy.request("GET", "http://localhost:80/email").then(({ body }) => {
      expect(body[0].html).to.include("OrdersFoo");
    });
  });
});

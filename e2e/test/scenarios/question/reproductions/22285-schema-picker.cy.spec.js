import { restore, startNewQuestion, popover } from "e2e/support/helpers";

describe("issue 22285", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/database").as("fetchDatabases");

    cy.intercept("GET", "/api/database/*/schemas", {
      body: ["PUBLIC", "FAKE SCHEMA"],
    });
  });

  it("should not clean DB schemas list in the data selector (metabase#22285)", () => {
    startNewQuestion();
    cy.wait("@fetchDatabases");

    popover().within(() => {
      cy.findByText("Raw Data").click();
      cy.wait(100);
      cy.findByText("Sample Database").click();

      cy.findByText(/Fake Schema/i);
      cy.findByText(/Public/i).click();
      cy.findByText("Orders");

      // go back to database picker
      cy.icon("chevronleft").click();

      cy.findByText("Sample Database").click();

      cy.findByText(/Fake Schema/i);
      cy.findByText(/Public/i);
    });
  });
});

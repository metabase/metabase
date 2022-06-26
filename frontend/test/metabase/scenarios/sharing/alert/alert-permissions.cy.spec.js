import { restore, setupSMTP, visitQuestion } from "__support__/e2e/helpers";

describe("scenarios > alert > alert permissions", () => {
  // Intentional use of before (not beforeEach) hook because the setup is quite long.
  // Make sure that all tests are always able to run independently!
  before(() => {
    restore();
    cy.signInAsAdmin();

    setupSMTP();

    // Create alert as admin
    visitQuestion(1);
    createBasicAlert({ firstAlert: true });

    // Create alert as admin that user can see
    visitQuestion(2);
    createBasicAlert({ includeNormal: true });

    // Create alert as normal user
    cy.signInAsNormalUser();
    visitQuestion(3);
    createBasicAlert();
  });

  describe("as an admin", () => {
    beforeEach(cy.signInAsAdmin);

    it("should let you see all created alerts", () => {
      cy.request("/api/alert").then(response => {
        expect(response.body).to.have.length(3);
      });
    });

    it("should let you edit an alert", () => {
      cy.intercept("PUT", "/api/alert/1").as("updatedAlert");

      // Change alert
      visitQuestion(1);
      cy.icon("bell").click();
      cy.findByText("Edit").click();

      cy.findByText("Daily").click();
      cy.findByText("Weekly").click();

      cy.button("Save changes").click();

      // Check that changes stuck
      cy.wait("@updatedAlert").then(({ response: { body } }) => {
        expect(body.channels[0].schedule_type).to.equal("weekly");
      });
    });
  });

  describe("as a non-admin / normal user", () => {
    beforeEach(cy.signInAsNormalUser);

    it("should not let you see other people's alerts", () => {
      visitQuestion(1);
      cy.icon("bell").click();

      cy.findByText("Unsubscribe").should("not.exist");
      cy.findByText("Set up an alert");
    });

    it("should let you see other alerts where you are a recipient", () => {
      visitQuestion(2);
      cy.icon("bell").click();

      cy.findByText("You're receiving Bobby's alerts");
      cy.findByText("Set up your own alert");
    });

    it("should let you see your own alerts", () => {
      visitQuestion(3);
      cy.icon("bell").click();

      cy.findByText("You set up an alert");
    });

    it("should let you unsubscribe from both your own and others' alerts", () => {
      // Unsubscribe from your own alert
      visitQuestion(3);
      cy.icon("bell").click();
      cy.findByText("Unsubscribe").click();

      cy.findByText("Okay, you're unsubscribed");

      // Unsubscribe from others' alerts
      visitQuestion(2);
      cy.icon("bell").click();
      cy.findByText("Unsubscribe").click();

      cy.findByText("Okay, you're unsubscribed");
    });
  });
});

function createBasicAlert({ firstAlert, includeNormal } = {}) {
  cy.get(".Icon-bell").click();

  if (firstAlert) {
    cy.findByText("Set up an alert").click();
  }

  if (includeNormal) {
    cy.findByText("Email alerts to:")
      .parent()
      .children()
      .last()
      .click();
    cy.findByText("Robert Tableton").click();
  }
  cy.findByText("Done").click();
  cy.findByText("Let's set up your alert").should("not.exist");
}

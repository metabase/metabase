import { restore, setupSMTP } from "__support__/e2e/cypress";

describe("scenarios > alert > alert permissions", () => {
  // Intentional use of before (not beforeEach) hook because the setup is quite long.
  // Make sure that all tests are always able to run independently!
  before(() => {
    restore();
    cy.signInAsAdmin();

    setupSMTP();

    // Create alert as admin
    cy.visit("/question/1");
    createBasicAlert({ firstAlert: true });

    // Create alert as admin that user can see
    cy.visit("/question/2");
    createBasicAlert({ includeNormal: true });

    // Create alert as normal user
    cy.signInAsNormalUser();
    cy.visit("/question/3");
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
      cy.visit(`/question/1`);
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
      cy.visit("/question/1");
      cy.icon("bell").click();

      cy.findByText("Unsubscribe").should("not.exist");
      cy.findByText("Set up an alert");
    });

    it("should let you see other alerts where you are a recipient", () => {
      cy.visit("/question/2");
      cy.icon("bell").click();

      cy.findByText("You're receiving Bobby's alerts");
      cy.findByText("Set up your own alert");
    });

    it("should let you see your own alerts", () => {
      cy.visit("/question/3");
      cy.icon("bell").click();

      cy.findByText("You set up an alert");
    });

    it("should let you unsubscribe from both your own and others' alerts", () => {
      // Unsubscribe from your own alert
      cy.visit("/question/3");
      cy.icon("bell").click();
      cy.findByText("Unsubscribe").click();

      cy.findByText("Okay, you're unsubscribed");

      // Unsubscribe from others' alerts
      cy.visit("/question/2");
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
    cy.findByText("Email alerts to:").parent().children().last().click();
    cy.findByText("Robert Tableton").click();
  }
  cy.findByText("Done").click();
  cy.findByText("Let's set up your alert").should("not.exist");
}

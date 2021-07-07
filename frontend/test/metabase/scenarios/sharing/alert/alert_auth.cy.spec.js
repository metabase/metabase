import {
  restore,
  setupLocalHostEmail,
  createBasicAlert,
} from "__support__/e2e/cypress";
// Port from alert.e2e.spec.js

// [quarantine]: cannot run tests that rely on email setup in CI (yet)
// TODO: unskip once we have update CI with this functionality
// NOTE: freely unskip if running these tests locally
describe.skip("scenarios > alert > auth for alerts", () => {
  before(() => {
    restore();
    cy.signInAsAdmin();

    // Setup email
    // NOTE: Must run `python -m smtpd -n -c DebuggingServer localhost:1025` before these tests
    cy.signInAsAdmin();
    cy.visit("/admin/settings/email");
    setupLocalHostEmail();

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
      cy.server();
      cy.route("PUT", "/api/alert/1").as("savedQuestion");

      // Change alert
      cy.visit(`/question/1`);
      cy.icon("bell").click();
      cy.findByText("Edit").click();
      cy.findByText("Daily").click();
      cy.findByText("Weekly").click();
      cy.findByText("Save changes").click();

      // Check that changes stuck
      cy.wait("@savedQuestion");
      cy.request("api/alert").then(response => {
        expect(response.body[0].channels[0].schedule_type).to.equal("weekly");
      });

      // Change alert back
      cy.icon("bell").click();
      cy.findByText("Edit").click();
      cy.findByText("Weekly").click();
      cy.findByText("Daily").click();
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

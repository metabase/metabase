import {
  restore,
  signInAsAdmin,
  setupLocalHostEmail,
} from "../../../__support__/cypress";

function setUpHourlyAlert(question_num) {
  cy.visit(`/question/${question_num}`);
  cy.get(".Icon-bell").click();
  cy.findByText("Set up an alert").click();
  cy.findByText("Daily").click();
  cy.findByText("Hourly").click();
}

describe("scenarios > alert > email_alert", () => {
  beforeEach(restore);
  beforeEach(signInAsAdmin);

  it("should have no alerts set up initially", () => {
    cy.server();
    cy.visit("/");

    cy.request("/api/alert").then(response => {
      expect(response.body).to.have.length(0);
    });
  });

  describe("alert set up", () => {
    beforeEach(() => {
      cy.server();

      cy.visit("/admin/settings/email");
      cy.findByText("SMTP Host");
      setupLocalHostEmail();
    });

    it("should work with email alerts toggled on", () => {
      // Set up alert
      setUpHourlyAlert(1);
      cy.findByText("Done").click();

      // Check alert api is sending email
      cy.request("/api/alert").then(response => {
        expect(response.body[0].channels).to.have.length(1);
        expect(response.body[0].channels[0].recipients).to.have.length(1);
      });
    });

    it("should have email alerts toggled off", () => {
      // Turn off email alerts during alert setup
      setUpHourlyAlert(2);
      cy.findByText("Email")
        .parent()
        .find("a")
        .click();
      cy.findByText("Done").click();

      // Check alert api is NOT sending email
      cy.request("/api/alert").then(response => {
        expect(response.body[0].channels).to.have.length(1);
        expect(response.body[0].channels[0].recipients).to.equal("null");
      });
    });
  });
});

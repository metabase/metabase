import { restore, setupSMTP, visitQuestion } from "e2e/support/helpers";

describe("scenarios > alert > email_alert", { tags: "@external" }, () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/alert").as("savedAlert");

    restore();
    cy.signInAsAdmin();

    setupSMTP();
  });

  it("should have no alerts set up initially", () => {
    cy.visit("/");

    cy.request("/api/alert").then(({ body }) => {
      expect(body).to.have.length(0);
    });
  });

  it("should set up an email alert", () => {
    openAlertForQuestion();
    cy.button("Done").click();

    cy.wait("@savedAlert").then(({ response: { body } }) => {
      expect(body.channels).to.have.length(1);
      expect(body.channels[0].channel_type).to.eq("email");
      expect(body.channels[0].enabled).to.eq(true);
    });
  });

  it("should respect email alerts toggled off (metabase#12349)", () => {
    openAlertForQuestion();

    // Turn off email
    toggleChannel("Email");

    // Turn on Slack
    toggleChannel("Slack");

    cy.button("Done").click();

    cy.wait("@savedAlert").then(({ response: { body } }) => {
      console.log(body);
      expect(body.channels).to.have.length(2);
      expect(body.channels[0].channel_type).to.eq("email");
      expect(body.channels[0].enabled).to.eq(false);
    });
  });
});

function openAlertForQuestion(id = 1) {
  visitQuestion(id);
  cy.icon("bell").click();

  cy.findByText("Set up an alert").click();
}

function toggleChannel(channel) {
  cy.findByText(channel).parent().find("input").click();
}

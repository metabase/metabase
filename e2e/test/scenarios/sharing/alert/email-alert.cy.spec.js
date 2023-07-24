import {
  restore,
  setupSMTP,
  visitQuestion,
  startNewQuestion,
  popover,
  visualize,
  modal,
} from "e2e/support/helpers";

describe("scenarios > alert > email_alert", { tags: "@external" }, () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/alert").as("savedAlert");
    cy.intercept("GET", "/api/card/*").as("card");

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

  it("should set up an email alert for newly created question", () => {
    startNewQuestion();

    popover().within(() => {
      cy.contains("Sample Database").click();
      cy.contains("People").click();
    });

    visualize();

    cy.icon("bell").click();

    cy.findByRole("dialog").within(() => {
      cy.findByLabelText("Name").type(" alert");
      cy.findByRole("button", { name: "Save" }).click();
    });

    cy.wait("@card");

    modal().within(() => {
      cy.findByRole("button", { name: "Set up an alert" }).click();
    });
    cy.findByRole("button", { name: "Done" }).click();

    cy.wait("@savedAlert").then(({ response: { body } }) => {
      expect(body.channels[0].channel_type).to.eq("email");
      expect(body.channels[0].enabled).to.eq(true);
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
